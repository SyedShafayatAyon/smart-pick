import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { VerifyRiderDto } from './dto/verify-rider.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('riders')
  getAllRiders() {
    return this.adminService.getAllRiders();
  }

  @Get('users')
  getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Patch('verify-rider/:id')
  verifyRider(@Param('id') id: string, @Body() dto: VerifyRiderDto) {
    return this.adminService.verifyRider(parseInt(id, 10), dto);
  }

  @Patch('riders/:id')
  verifyRiderAlias(@Param('id') id: string, @Body() dto: VerifyRiderDto) {
    return this.adminService.verifyRider(parseInt(id, 10), dto);
  }

  @Patch('users/suspend/:id')
  suspendUser(@Param('id') id: string) {
    return this.adminService.suspendUser(parseInt(id, 10));
  }
}
