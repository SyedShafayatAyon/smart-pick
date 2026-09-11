import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RiderVerifiedGuard } from '../common/guards/rider-verified.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { FindAvailableOrdersDto } from './dto/find-available-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order } from './entities/order.entity';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ---- CUSTOMER LOGIC ----

  @Post('create')
  @Roles(Role.Customer)
  createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<Order> {
    return this.ordersService.createOrder(createOrderDto, req.user);
  }

  @Patch('customer/edit/:id')
  @Roles(Role.Customer)
  editOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<Order> {
    return this.ordersService.editOrder(id, updateOrderDto, req.user);
  }

  @Delete('customer/cancel/:id')
  @Roles(Role.Customer)
  cancelOrder(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<string> {
    return this.ordersService.cancelOrder(id, req.user);
  }

  @Get('customer/history')
  @Roles(Role.Customer)
  getCustomerHistory(@Req() req: AuthenticatedRequest): Promise<Order[]> {
    return this.ordersService.getCustomerHistory(req.user);
  }

  // ---- RIDER LOGIC ----

  @Get('available')
  @Roles(Role.Rider)
  @UseGuards(RiderVerifiedGuard)
  findAvailable(@Query() query: FindAvailableOrdersDto) {
    return this.ordersService.findAvailable(query);
  }

  @Get('rider/active')
  @Roles(Role.Rider)
  @UseGuards(RiderVerifiedGuard)
  getRiderActiveOrder(@Req() req: AuthenticatedRequest): Promise<Order | null> {
    return this.ordersService.getRiderActiveOrder(req.user);
  }

  @Patch('accept/:id')
  @Roles(Role.Rider)
  @UseGuards(RiderVerifiedGuard)
  accept(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.ordersService.acceptOrder(Number(id), req.user);
  }

  @Patch('status/:id')
  @Roles(Role.Rider)
  @UseGuards(RiderVerifiedGuard)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.ordersService.updateStatus(Number(id), dto, req.user);
  }
}
