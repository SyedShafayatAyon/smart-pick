import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { RiderVerification } from './entities/rider-verification.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../common/enums/role.enum';
import { VerificationStatus } from '../common/enums/verification-status.enum';
import * as bcrypt from 'bcrypt';
import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,

    @InjectRepository(RiderVerification)
    private readonly verificationRepository: Repository<RiderVerification>,
  ) {}

  async onModuleInit() {
    const adminExists = await this.usersRepo.findOne({
      where: { role: Role.Admin },
    });

    if (!adminExists) {
      const hashPassword = await bcrypt.hash('admin123', 10);
      const adminUser = this.usersRepo.create({
        name: 'System Admin',
        email: 'admin@smartpick.com',
        phone: '01700000000',
        password: hashPassword,
        role: Role.Admin,
        isActive: true,
      });
      await this.usersRepo.save(adminUser);
      console.log('Admin user created successfully');
    }
  }

  async findByIdentity(identity: string): Promise<User | null> {
    return await this.usersRepo.findOne({
      where: [{ email: identity }, { phone: identity }],
      relations: { riderVerification: true },
    });
  }

  async createCustomer(userData: Partial<User>): Promise<User> {
    const newUser = this.usersRepo.create({
      ...userData,
      role: Role.Customer,
    });
    return await this.usersRepo.save(newUser);
  }

  async createRider(
    userData: Partial<User>,
    nidNumber: string,
    nidImage: string,
  ): Promise<User> {
    const newRider = this.usersRepo.create({
      ...userData,
      role: Role.Rider,
    });
    const savedRider = await this.usersRepo.save(newRider);

    const verification = this.verificationRepository.create({
      userId: savedRider.id,
      nidNumber,
      nidImagePath: nidImage,
      status: VerificationStatus.Pending,
      user: savedRider,
    });
    await this.verificationRepository.save(verification);

    return savedRider;
  }

  async findProfile(userId: number) {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: { riderVerification: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { password, ...result } = user;
    return result;
  }

  async updateProfile(userId: number, updateUserDto: UpdateUserDto) {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: { riderVerification: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (updateUserDto.name) {
      user.name = updateUserDto.name;
    }

    if (updateUserDto.phone) {
      user.phone = updateUserDto.phone;
    }

    if (updateUserDto.email) {
      const existingUser = await this.usersRepo.findOne({
        where: { email: updateUserDto.email, id: Not(userId) },
      });
      if (existingUser) {
        throw new ConflictException('Email already exists');
      }
      user.email = updateUserDto.email;
    }

    if (updateUserDto.password) {
      user.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    const savedUser = await this.usersRepo.save(user);
    const { password, ...result } = savedUser;
    return result;
  }

  async suspendUser(userId: number) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.isActive = false;
    const savedUser = await this.usersRepo.save(user);
    const { password, ...result } = savedUser;
    return result;
  }

  async findAllUsers() {
    const users = await this.usersRepo.find({
      relations: { riderVerification: true },
    });
    return users.map(({ password, ...user }) => user);
  }
}

