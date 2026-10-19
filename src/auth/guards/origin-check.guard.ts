import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Defence-in-depth CSRF check for cookie-authenticated auth endpoints: when a
 * browser sends an Origin (or Referer) it must belong to the configured CORS
 * allow-list. Non-browser clients without those headers are left to the cookie
 * SameSite policy.
 */
@Injectable()
export class OriginCheckGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = this.resolveOrigin(request);

    if (origin === null) {
      return true;
    }

    const allowed = this.configService.get<string[]>('app.corsOrigins') ?? [];

    if (allowed.includes(origin)) {
      return true;
    }

    throw new ForbiddenException('Origin not allowed.');
  }

  private resolveOrigin(request: Request): string | null {
    const origin = request.headers.origin;

    if (typeof origin === 'string' && origin !== '') {
      return origin;
    }

    const referer = request.headers.referer;

    if (typeof referer === 'string' && referer !== '') {
      try {
        return new URL(referer).origin;
      } catch {
        return null;
      }
    }

    return null;
  }
}
