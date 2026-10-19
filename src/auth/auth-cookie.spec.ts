import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './auth-cookie.js';

interface RecordedCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

function createConfig(isProduction = false, apiPrefix = 'api'): ConfigService {
  return {
    getOrThrow: (key: string) => {
      const values: Record<string, unknown> = {
        'app.apiPrefix': apiPrefix,
        'app.isProduction': isProduction,
        'auth.cookieSameSite': 'lax',
      };

      return values[key];
    },
    get: () => undefined,
  } as unknown as ConfigService;
}

function createResponse(): {
  response: Response;
  set: RecordedCookie[];
  cleared: RecordedCookie[];
} {
  const set: RecordedCookie[] = [];
  const cleared: RecordedCookie[] = [];
  const response = {
    cookie: (name: string, value: string, options: CookieOptions) => {
      set.push({ name, value, options });
      return response;
    },
    clearCookie: (name: string, options: CookieOptions) => {
      cleared.push({ name, value: '', options });
      return response;
    },
  } as unknown as Response;

  return { response, set, cleared };
}

describe('auth cookies', () => {
  it('sets an httpOnly refresh cookie scoped to the school auth path', () => {
    const { response, set } = createResponse();

    setRefreshCookie(
      response,
      'app',
      'token-1',
      new Date('2030-01-01'),
      createConfig(),
    );

    expect(set).toHaveLength(1);
    expect(set[0].name).toBe('pg_rt');
    expect(set[0].value).toBe('token-1');
    expect(set[0].options).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/auth',
    });
  });

  it('sets the admin cookie under its own name and path', () => {
    const { response, set } = createResponse();

    setRefreshCookie(
      response,
      'admin',
      'token-2',
      new Date('2030-01-01'),
      createConfig(),
    );

    expect(set[0].name).toBe('pg_admin_rt');
    expect(set[0].options.path).toBe('/api/admin/auth');
  });

  it('marks cookies secure in production', () => {
    const { response, set } = createResponse();

    setRefreshCookie(
      response,
      'app',
      'token-1',
      new Date('2030-01-01'),
      createConfig(true),
    );

    expect(set[0].options.secure).toBe(true);
  });

  it('clears the cookie with the same path', () => {
    const { response, cleared } = createResponse();

    clearRefreshCookie(response, 'app', createConfig());

    expect(cleared[0].name).toBe('pg_rt');
    expect(cleared[0].options.path).toBe('/api/auth');
  });

  it('reads the refresh cookie or returns null', () => {
    const request = { cookies: { pg_rt: 'token-1' } };
    const empty = { cookies: {} };

    expect(readRefreshCookie(request as never, 'app')).toBe('token-1');
    expect(readRefreshCookie(empty as never, 'app')).toBeNull();
    expect(readRefreshCookie({} as never, 'app')).toBeNull();
  });
});
