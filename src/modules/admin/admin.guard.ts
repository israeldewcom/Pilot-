import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AdminRole } from '../../entities/entities';
import { AdminService } from './admin.service';

export const ADMIN_ROLES_KEY = 'adminRoles';
import { SetMetadata } from '@nestjs/common';
export const AdminRoles = (...roles: string[]) => SetMetadata(ADMIN_ROLES_KEY, roles);

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private adminService: AdminService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ADMIN_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user;

    if (!user || !user.isPlatformAdmin) {
      throw new ForbiddenException('Admin access required');
    }

    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.includes(user.adminRole);
      if (!hasRole) throw new ForbiddenException('Insufficient admin privileges');
    }

    if ([AdminRole.SUPER_ADMIN, AdminRole.BILLING_ADMIN].includes(user.adminRole) && request.method !== 'GET') {
      const totpToken = request.headers['x-admin-totp'] as string;
      if (!totpToken) throw new UnauthorizedException('2FA token required for this operation');
      const valid = await this.adminService.verifyAdmin2FA(user.id, totpToken);
      if (!valid) throw new UnauthorizedException('Invalid 2FA token');
    }

    (request as any).admin = { id: user.id, email: user.email, role: user.adminRole };
    return true;
  }
}
