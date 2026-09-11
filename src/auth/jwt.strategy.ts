import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '../common/enums/role.enum';
import { VerificationStatus } from '../common/enums/verification-status.enum';

import { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: number;
  email?: string;
  role: Role;
  riderVerification?: { status: VerificationStatus };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ?? 'smart-pick-secret',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }

    let riderVerification = payload.riderVerification;
    if (payload.role === Role.Rider) {
      try {
        const profile = await this.usersService.findProfile(payload.sub);
        if (!profile.isActive) {
          throw new UnauthorizedException('Your account has been suspended');
        }
        if (profile.riderVerification) {
          riderVerification = { status: profile.riderVerification.status };
        }
      } catch (err) {
        if (err instanceof UnauthorizedException) {
          throw err;
        }
      }
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      riderVerification,
    };
  }
}
