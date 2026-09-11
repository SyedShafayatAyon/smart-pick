import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderStatus } from './enums/order.enum';
import { DeliveryZone } from '../zones/entities/delivery-zone.entity';
import { RiderVerification } from '../users/entities/rider-verification.entity';
import { VerificationStatus } from '../common/enums/verification-status.enum';
import { FindAvailableOrdersDto } from './dto/find-available-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

const RIDER_ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.Pending]: [],
  [OrderStatus.Accepted]: [OrderStatus.PickedUp],
  [OrderStatus.PickedUp]: [OrderStatus.InTransit],
  [OrderStatus.InTransit]: [OrderStatus.Delivered],
  [OrderStatus.Delivered]: [],
  [OrderStatus.Cancelled]: [],
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(RiderVerification)
    private readonly riderVerificationRepository: Repository<RiderVerification>,
    @InjectRepository(DeliveryZone)
    private readonly zoneRepo: Repository<DeliveryZone>,
  ) {}

  private get orderRepo(): Repository<Order> {
    return this.orderRepository;
  }

  private async calculateFare(
    dropZone: string,
    weight: number,
    deliveryType: string,
  ): Promise<number> {
    const zone = await this.zoneRepo.findOne({
      where: [{ name: dropZone }],
    });

    if (!zone) {
      throw new BadRequestException(
        `Zone '${dropZone}' not found. Please use a valid zone name.`,
      );
    }
    const baseFare =
      deliveryType === 'express'
        ? Number(zone.baseExpressFare)
        : Number(zone.baseRegularFare);

    const limit = Number(zone.weightLimitKg ?? 2);
    let fare = baseFare;
    if (weight > limit) {
      const extraWeight = weight - limit;
      const extraCharge = extraWeight * Number(zone.extraWeightRate);
      fare += extraCharge;
    }

    return Math.round(fare * 100) / 100;
  }

  // ---- CUSTOMER LOGIC ----

  async createOrder(
    createOrderDto: CreateOrderDto,
    customer: { id: number },
  ): Promise<Order> {
    const fare = await this.calculateFare(
      createOrderDto.dropZone,
      createOrderDto.weight,
      createOrderDto.deliveryType,
    );

    const order = this.orderRepository.create({
      ...createOrderDto,
      fare: fare,
      status: OrderStatus.Pending,
      customerId: customer.id,
      acceptedAt: null,
    });

    return await this.orderRepository.save(order);
  }

  async editOrder(
    id: number,
    updateOrderDto: UpdateOrderDto,
    customer: { id: number },
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: id },
      relations: { customer: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with id ${id} not found`);
    }

    const customerId = order.customerId ?? order.customer?.id;
    if (customerId && customerId !== customer.id) {
      throw new ForbiddenException('You are not allowed to edit this order');
    }

    if (order.status !== OrderStatus.Pending) {
      throw new BadRequestException(
        `Cannot edit order. Order status is '${order.status}'. Only 'pending' orders can be edited.`,
      );
    }

    const newDropZone = updateOrderDto.dropZone ?? order.dropZone ?? 'Inside Dhaka';
    const newWeight = updateOrderDto.weight ?? order.weight;
    const newDeliveryType = updateOrderDto.deliveryType ?? order.deliveryType;

    const newFare = await this.calculateFare(
      newDropZone,
      newWeight,
      newDeliveryType,
    );

    Object.assign(order, updateOrderDto, { fare: newFare });

    return await this.orderRepository.save(order);
  }

  async cancelOrder(id: number, customer: { id: number }): Promise<string> {
    const order = await this.orderRepository.findOne({
      where: { id: id },
      relations: { customer: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with id ${id} not found`);
    }

    const customerId = order.customerId ?? order.customer?.id;
    if (customerId && customerId !== customer.id) {
      throw new ForbiddenException('You are not allowed to cancel this order');
    }

    if (order.status === OrderStatus.Pending) {
      order.status = OrderStatus.Cancelled;
      await this.orderRepository.save(order);
      return `Order id ${id} has been cancelled successfully`;
    }

    if (order.status === OrderStatus.Accepted) {
      if (!order.acceptedAt) {
        throw new BadRequestException('Invalid order state: acceptedAt is missing.');
      }
      const now = new Date();
      const acceptedAt = new Date(order.acceptedAt);
      const diffInMilliseconds = now.getTime() - acceptedAt.getTime();
      const diffInHours = diffInMilliseconds / (1000 * 60 * 60);

      if (diffInHours <= 1) {
        order.status = OrderStatus.Cancelled;
        await this.orderRepository.save(order);
        return `Order id ${id} has been cancelled successfully`;
      } else {
        throw new BadRequestException(
          'Cannot cancel order. More than 1 hour has passed since the rider accepted.',
        );
      }
    }

    throw new BadRequestException(
      `Cannot cancel order with status '${order.status}'.`,
    );
  }

  async getCustomerHistory(customer: { id: number }): Promise<Order[]> {
    return await this.orderRepository.find({
      where: [
        { customerId: customer.id },
        { customer: { id: customer.id } },
      ],
      relations: {
        rider: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  // ---- RIDER LOGIC ----

  async getRiderActiveOrder(rider: { id: number }): Promise<Order | null> {
    await this.assertRiderVerified(rider.id);

    const order = await this.orderRepository.findOne({
      where: [
        { riderId: rider.id, status: OrderStatus.Accepted },
        { riderId: rider.id, status: OrderStatus.PickedUp },
        { riderId: rider.id, status: OrderStatus.InTransit },
        { rider: { id: rider.id }, status: OrderStatus.Accepted },
        { rider: { id: rider.id }, status: OrderStatus.PickedUp },
        { rider: { id: rider.id }, status: OrderStatus.InTransit },
      ],
      relations: {
        customer: true,
      },
      order: {
        acceptedAt: 'DESC',
        id: 'DESC',
      },
    });

    if (order?.customer) {
      delete (order.customer as any).password;
    }

    return order;
  }

  async findAvailable(query: FindAvailableOrdersDto): Promise<Order[]> {
    const where: FindOptionsWhere<Order> = { status: OrderStatus.Pending };
    if (query.pickupZoneId) where.pickupZoneId = query.pickupZoneId;
    if (query.dropZoneId) where.dropZoneId = query.dropZoneId;
    return this.orderRepository.find({
      where,
      relations: { customer: true },
      order: { createdAt: 'ASC' },
    });
  }

  async acceptOrder(orderId: number, rider: { id: number }): Promise<Order> {
    await this.assertRiderVerified(rider.id);

    const order = await this.findOneOrFail(orderId);
    if (order.status !== OrderStatus.Pending) {
      throw new BadRequestException(
        'Order is no longer available for acceptance',
      );
    }
    if (order.riderId) {
      throw new BadRequestException('Order already has a rider assigned');
    }

    order.riderId = rider.id;
    order.status = OrderStatus.Accepted;
    order.acceptedAt = new Date();
    return this.orderRepository.save(order);
  }

  async updateStatus(
    orderId: number,
    dto: UpdateOrderStatusDto,
    rider: { id: number },
  ): Promise<Order> {
    await this.assertRiderVerified(rider.id);

    const order = await this.findOneOrFail(orderId);
    if (order.riderId !== rider.id) {
      throw new ForbiddenException('You are not assigned to this order');
    }

    const allowed = RIDER_ALLOWED_TRANSITIONS[order.status];
    if (!allowed || !allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${order.status} to ${dto.status}`,
      );
    }

    order.status = dto.status;
    return this.orderRepository.save(order);
  }

  private async assertRiderVerified(userId: number): Promise<void> {
    const verification = await this.riderVerificationRepository.findOne({
      where: { userId },
    });
    if (!verification || verification.status !== VerificationStatus.Approved) {
      throw new ForbiddenException('Rider account is not verified');
    }
  }

  private async findOneOrFail(orderId: number): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: { customer: true, rider: true },
    });
    if (!order) {
      throw new NotFoundException(`Order #${orderId} not found`);
    }
    return order;
  }
}
