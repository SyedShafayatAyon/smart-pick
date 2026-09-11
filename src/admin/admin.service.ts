import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Order } from '../orders/entities/order.entity';
import { RiderVerification } from '../users/entities/rider-verification.entity';
import { User } from '../users/entities/user.entity';
import { Repository } from 'typeorm';
import { VerifyRiderDto } from './dto/verify-rider.dto';
import { Role } from '../common/enums/role.enum';
import { OrderStatus } from '../orders/enums/order.enum';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RiderVerification)
    private readonly riderVerificationRepo: Repository<RiderVerification>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async getAllRiders() {
    const riders = await this.userRepo.find({
      where: { role: Role.Rider },
      relations: { riderVerification: true },
      order: { createdAt: 'DESC' },
    });
    return riders.map(({ password, ...rider }) => rider);
  }

  async getAllUsers() {
    const users = await this.userRepo.find({
      relations: { riderVerification: true },
      order: { createdAt: 'DESC' },
    });
    return users.map(({ password, ...user }) => user);
  }

  async verifyRider(userId: number, dto: VerifyRiderDto) {
    const riderVerification = await this.riderVerificationRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!riderVerification) {
      throw new NotFoundException('Rider verification submission not found');
    }
    riderVerification.status = dto.status;
    return await this.riderVerificationRepo.save(riderVerification);
  }

  async suspendUser(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.isActive = false;
    return await this.userRepo.save(user);
  }

  async getDashboardStats() {
    const totalUsers = await this.userRepo.count();
    const totalCustomers = await this.userRepo.count({
      where: { role: Role.Customer },
    });
    const totalRiders = await this.userRepo.count({
      where: { role: Role.Rider },
    });
    const totalAdmins = await this.userRepo.count({
      where: { role: Role.Admin },
    });

    const totalOrders = await this.orderRepo.count();
    const pendingOrders = await this.orderRepo.count({
      where: { status: OrderStatus.Pending },
    });
    const acceptedOrders = await this.orderRepo.count({
      where: { status: OrderStatus.Accepted },
    });
    const deliveredOrders = await this.orderRepo.count({
      where: { status: OrderStatus.Delivered },
    });
    const cancelledOrders = await this.orderRepo.count({
      where: { status: OrderStatus.Cancelled },
    });

    const totalRevenueResult = await this.orderRepo
      .createQueryBuilder('order')
      .select('SUM(order.fare)', 'total')
      .where('order.status = :status', { status: OrderStatus.Delivered })
      .getRawOne();

    const totalRevenue = parseFloat(totalRevenueResult?.total || '0');

    return {
      users: {
        total: totalUsers,
        customers: totalCustomers,
        riders: totalRiders,
        admins: totalAdmins,
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        accepted: acceptedOrders,
        delivered: deliveredOrders,
        cancelled: cancelledOrders,
      },
      revenue: totalRevenue,
    };
  }
}
