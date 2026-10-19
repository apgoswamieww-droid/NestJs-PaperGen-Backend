import { registerAs } from '@nestjs/config';
import {
  type CookieSameSite,
  type NodeEnv,
  splitOrigins,
} from './env.validation.js';

export const appConfig = registerAs('app', () => ({
  nodeEnv: (process.env['NODE_ENV'] ?? 'development') as NodeEnv,
  isProduction: process.env['NODE_ENV'] === 'production',
  port: Number(process.env['PORT'] ?? 3000),
  apiPrefix: process.env['API_PREFIX'] ?? 'api',
  corsOrigins: splitOrigins(process.env['CORS_ORIGINS']),
  trustProxy: process.env['TRUST_PROXY'] === 'true',
  throttleTtlSeconds: Number(process.env['THROTTLE_TTL_SECONDS'] ?? 60),
  throttleLimit: Number(process.env['THROTTLE_LIMIT'] ?? 10),
}));

export const databaseConfig = registerAs('database', () => ({
  uri: process.env['MONGODB_URI'] as string,
}));

export const authConfig = registerAs('auth', () => ({
  appAccessSecret: process.env['JWT_APP_ACCESS_SECRET'] as string,
  adminAccessSecret: process.env['JWT_ADMIN_ACCESS_SECRET'] as string,
  accessTtl: process.env['JWT_ACCESS_TTL'] ?? '15m',
  refreshTtlHours: Number(process.env['REFRESH_TTL_HOURS'] ?? 12),
  refreshTtlRememberDays: Number(
    process.env['REFRESH_TTL_REMEMBER_DAYS'] ?? 30,
  ),
  cookieDomain: process.env['COOKIE_DOMAIN'] ?? undefined,
  cookieSameSite: (
    process.env['COOKIE_SAMESITE'] ?? 'lax'
  ).toLowerCase() as CookieSameSite,
  lockoutAttempts: Number(process.env['AUTH_LOCKOUT_ATTEMPTS'] ?? 5),
  lockoutMinutes: Number(process.env['AUTH_LOCKOUT_MINUTES'] ?? 15),
}));

export const mailConfig = registerAs('mail', () => ({
  host: process.env['SMTP_HOST'] ?? 'smtp.gmail.com',
  port: Number(process.env['SMTP_PORT'] ?? 465),
  secure: (process.env['SMTP_SECURE'] ?? 'true') === 'true',
  user: process.env['SMTP_USER'] ?? '',
  pass: process.env['SMTP_PASS'] ?? '',
  from: process.env['MAIL_FROM'] ?? '',
  appUrl: (process.env['APP_URL'] ?? 'http://localhost:4200').replace(
    /\/+$/,
    '',
  ),
  resetTtlMinutes: Number(process.env['PASSWORD_RESET_TTL_MINUTES'] ?? 30),
  inviteTtlHours: Number(process.env['INVITE_TTL_HOURS'] ?? 72),
}));

export type AppConfig = ReturnType<typeof appConfig>;
export type DatabaseConfig = ReturnType<typeof databaseConfig>;
export type AuthConfig = ReturnType<typeof authConfig>;
export type MailConfig = ReturnType<typeof mailConfig>;
