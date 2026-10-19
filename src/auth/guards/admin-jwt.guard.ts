import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth.types.js';
import { TokensService } from '../tokens.service.js';
import { extractBearerToken } from './jwt-auth.guard.js';

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(private readonly tokensService: TokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    const payload = await this.tokensService.verifyAccessToken(token, 'admin');

    if (!payload) {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    request.auth = { id: payload.sub, role: payload.role };

    return true;
  }
}
