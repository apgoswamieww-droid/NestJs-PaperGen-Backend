import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthIdentity, AuthenticatedRequest } from '../auth.types.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthIdentity => {
    const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!auth) {
      throw new UnauthorizedException('Authentication required.');
    }

    return auth;
  },
);
