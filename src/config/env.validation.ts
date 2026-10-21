const NODE_ENVS = ['development', 'production', 'test'] as const;
const COOKIE_SAME_SITES = ['lax', 'strict', 'none'] as const;

const API_PREFIX_PATTERN = /^[a-z0-9][a-z0-9/-]*$/i;
const TTL_PATTERN = /^\d+[smhd]$/;
const MIN_SECRET_LENGTH = 32;

export type NodeEnv = (typeof NODE_ENVS)[number];
export type CookieSameSite = (typeof COOKIE_SAME_SITES)[number];

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(`Environment variable validation failed: ${message}`);
    this.name = 'ConfigValidationError';
  }
}

interface IntOptions {
  readonly min: number;
  readonly max: number;
}

function validateInt(
  config: Record<string, unknown>,
  name: string,
  options: IntOptions,
): void {
  const value = config[name];

  if (value === undefined || value === '') {
    return;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < options.min ||
    parsed > options.max
  ) {
    throw new ConfigValidationError(
      `${name} must be an integer between ${options.min} and ${options.max}`,
    );
  }
}

function validateSecret(config: Record<string, unknown>, name: string): void {
  const value = config[name];

  if (typeof value !== 'string' || value.trim().length < MIN_SECRET_LENGTH) {
    throw new ConfigValidationError(
      `${name} is required and must be at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv = config['NODE_ENV'];

  if (typeof nodeEnv !== 'string' || !NODE_ENVS.includes(nodeEnv as NodeEnv)) {
    throw new ConfigValidationError(
      `NODE_ENV must be one of: ${NODE_ENVS.join(', ')}`,
    );
  }

  const mongoUri = config['MONGODB_URI'];

  if (typeof mongoUri !== 'string' || mongoUri.trim() === '') {
    throw new ConfigValidationError('MONGODB_URI is required');
  } else if (
    !mongoUri.startsWith('mongodb://') &&
    !mongoUri.startsWith('mongodb+srv://')
  ) {
    throw new ConfigValidationError(
      'MONGODB_URI must start with mongodb:// or mongodb+srv://',
    );
  }

  const port = config['PORT'];

  if (port !== undefined && port !== '') {
    const parsed = Number(port);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new ConfigValidationError(
        'PORT must be an integer between 1 and 65535',
      );
    }
  }

  const apiPrefix = config['API_PREFIX'];

  if (apiPrefix !== undefined && typeof apiPrefix !== 'string') {
    throw new ConfigValidationError('API_PREFIX must be a string');
  }

  if (
    typeof apiPrefix === 'string' &&
    apiPrefix !== '' &&
    !API_PREFIX_PATTERN.test(apiPrefix)
  ) {
    throw new ConfigValidationError(
      'API_PREFIX must be a URL-safe path segment (e.g. "api")',
    );
  }

  validateSecret(config, 'JWT_APP_ACCESS_SECRET');
  validateSecret(config, 'JWT_ADMIN_ACCESS_SECRET');

  if (config['JWT_APP_ACCESS_SECRET'] === config['JWT_ADMIN_ACCESS_SECRET']) {
    throw new ConfigValidationError(
      'JWT_APP_ACCESS_SECRET and JWT_ADMIN_ACCESS_SECRET must be different',
    );
  }

  const accessTtl = config['JWT_ACCESS_TTL'];

  if (accessTtl !== undefined && accessTtl !== '') {
    if (typeof accessTtl !== 'string' || !TTL_PATTERN.test(accessTtl)) {
      throw new ConfigValidationError(
        'JWT_ACCESS_TTL must be a duration such as "15m", "1h" or "7d"',
      );
    }
  }

  const sameSite = config['COOKIE_SAMESITE'];

  if (
    sameSite !== undefined &&
    sameSite !== '' &&
    (typeof sameSite !== 'string' ||
      !COOKIE_SAME_SITES.includes(sameSite.toLowerCase() as CookieSameSite))
  ) {
    throw new ConfigValidationError(
      `COOKIE_SAMESITE must be one of: ${COOKIE_SAME_SITES.join(', ')}`,
    );
  }

  const cookieDomain = config['COOKIE_DOMAIN'];

  if (cookieDomain !== undefined && typeof cookieDomain !== 'string') {
    throw new ConfigValidationError('COOKIE_DOMAIN must be a string');
  }

  validateInt(config, 'THROTTLE_TTL_SECONDS', { min: 1, max: 3600 });
  validateInt(config, 'THROTTLE_LIMIT', { min: 1, max: 10_000 });
  validateInt(config, 'REFRESH_TTL_HOURS', { min: 1, max: 720 });
  validateInt(config, 'REFRESH_TTL_REMEMBER_DAYS', { min: 1, max: 365 });
  validateInt(config, 'AUTH_LOCKOUT_ATTEMPTS', { min: 1, max: 100 });
  validateInt(config, 'AUTH_LOCKOUT_MINUTES', { min: 1, max: 1440 });
  validateInt(config, 'PASSWORD_MAX_AGE_DAYS', { min: 1, max: 3650 });
  validateInt(config, 'SMTP_PORT', { min: 1, max: 65535 });
  validateInt(config, 'PASSWORD_RESET_TTL_MINUTES', { min: 5, max: 1440 });
  validateInt(config, 'INVITE_TTL_HOURS', { min: 1, max: 720 });

  const smtpSecure = config['SMTP_SECURE'];

  if (
    smtpSecure !== undefined &&
    smtpSecure !== '' &&
    smtpSecure !== 'true' &&
    smtpSecure !== 'false'
  ) {
    throw new ConfigValidationError('SMTP_SECURE must be "true" or "false"');
  }

  const appUrl = config['APP_URL'];

  if (appUrl !== undefined && appUrl !== '') {
    if (typeof appUrl !== 'string' || !isHttpUrl(appUrl)) {
      throw new ConfigValidationError(
        'APP_URL must be an absolute http(s) URL (e.g. https://app.example.com)',
      );
    }
  }

  const trustProxy = config['TRUST_PROXY'];

  if (
    trustProxy !== undefined &&
    trustProxy !== '' &&
    trustProxy !== 'true' &&
    trustProxy !== 'false'
  ) {
    throw new ConfigValidationError('TRUST_PROXY must be "true" or "false"');
  }

  return config;
}

export function splitOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
