import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../auth.types.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import type { Permission } from '../permissions.js';
import { RolePermissionsService } from '../role-permissions.service.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolePermissions: RolePermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!auth) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    const access = await this.rolePermissions.resolveAccess(auth.id);

    if (!access) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    auth.role = access.role;
    auth.permissions = access.permissions;

    if (access.passwordExpired) {
      throw new ForbiddenException({
        code: 'PASSWORD_EXPIRED',
        message: 'Your password has expired. Please choose a new password.',
      });
    }

    if (access.role === 'school_admin') {
      return true;
    }

    if (
      required.every((permission) => access.permissions.includes(permission))
    ) {
      return true;
    }

    throw new ForbiddenException('Insufficient permissions.');
  }
}
