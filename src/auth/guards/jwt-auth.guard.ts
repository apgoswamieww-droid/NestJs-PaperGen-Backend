import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../auth.types.js';
import { TokensService } from '../tokens.service.js';

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;

  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return null;
  }

  const token = header.slice('Bearer '.length).trim();

  return token === '' ? null : token;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokensService: TokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    const payload = await this.tokensService.verifyAccessToken(token, 'app');

    if (!payload) {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    request.auth = {
      id: payload.sub,
      role: payload.role,
      tenantId: payload.tid,
    };

    return true;
  }
}
