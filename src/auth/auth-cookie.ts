import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthScope } from './auth.types.js';

export const REFRESH_COOKIE_NAMES: Record<AuthScope, string> = {
  app: 'pg_rt',
  admin: 'pg_admin_rt',
};

function cookiePath(scope: AuthScope, configService: ConfigService): string {
  const prefix = configService.getOrThrow<string>('app.apiPrefix');

  return scope === 'admin' ? `/${prefix}/admin/auth` : `/${prefix}/auth`;
}

function baseOptions(
  scope: AuthScope,
  configService: ConfigService,
): CookieOptions {
  return {
    httpOnly: true,
    secure: configService.getOrThrow<boolean>('app.isProduction'),
    sameSite: configService.getOrThrow<'lax' | 'strict' | 'none'>(
      'auth.cookieSameSite',
    ),
    domain: configService.get<string>('auth.cookieDomain'),
    path: cookiePath(scope, configService),
  };
}

export function setRefreshCookie(
  response: Response,
  scope: AuthScope,
  token: string,
  expiresAt: Date,
  configService: ConfigService,
): void {
  response.cookie(REFRESH_COOKIE_NAMES[scope], token, {
    ...baseOptions(scope, configService),
    expires: expiresAt,
  });
}

export function clearRefreshCookie(
  response: Response,
  scope: AuthScope,
  configService: ConfigService,
): void {
  response.clearCookie(
    REFRESH_COOKIE_NAMES[scope],
    baseOptions(scope, configService),
  );
}

export function readRefreshCookie(
  request: Request,
  scope: AuthScope,
): string | null {
  const cookies = request.cookies as Record<string, string> | undefined;

  return cookies?.[REFRESH_COOKIE_NAMES[scope]] ?? null;
}
