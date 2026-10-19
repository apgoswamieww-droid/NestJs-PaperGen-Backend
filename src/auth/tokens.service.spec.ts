import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Model } from 'mongoose';
import { RefreshToken } from '../schemas/refresh-token.schema.js';
import { TokensService } from './tokens.service.js';

const VALUES: Record<string, unknown> = {
  'auth.accessTtl': '15m',
  'auth.appAccessSecret': 'app-secret-0123456789abcdefghijklmnopqrstuvwxyz',
  'auth.adminAccessSecret': 'admin-secret-0123456789abcdefghijklmnopqrstuvwxyz',
  'auth.refreshTtlHours': 12,
  'auth.refreshTtlRememberDays': 30,
};

function createService(overrides: Record<string, unknown> = {}): TokensService {
  const values = { ...VALUES, ...overrides };
  const configService = {
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService;
  const refreshTokenModel = {} as Model<RefreshToken>;

  return new TokensService(
    new JwtService({}),
    configService,
    refreshTokenModel,
  );
}

describe('TokensService (access tokens)', () => {
  it('issues and verifies an app token with the expected claims', async () => {
    const service = createService();
    const token = await service.issueAccessToken(
      { id: 'user-1', role: 'school_admin', tenantId: 'tenant-1' },
      'app',
    );

    const payload = await service.verifyAccessToken(token, 'app');

    expect(payload).not.toBeNull();
    expect(payload).toMatchObject({
      sub: 'user-1',
      aud: 'app',
      iss: 'papergen-api',
      role: 'school_admin',
      tid: 'tenant-1',
    });
  });

  it('rejects an app token when verified with the admin audience', async () => {
    const service = createService();
    const token = await service.issueAccessToken(
      { id: 'user-1', role: 'school_admin' },
      'app',
    );

    await expect(service.verifyAccessToken(token, 'admin')).resolves.toBeNull();
  });

  it('rejects an admin token when verified with the app audience', async () => {
    const service = createService();
    const token = await service.issueAccessToken(
      { id: 'admin-1', role: 'super_admin' },
      'admin',
    );

    await expect(service.verifyAccessToken(token, 'app')).resolves.toBeNull();
  });

  it('rejects a token signed with a foreign secret', async () => {
    const service = createService();
    const foreign = new JwtService({});
    const token = await foreign.signAsync(
      { role: 'school_admin' },
      {
        subject: 'user-1',
        audience: 'app',
        issuer: 'papergen-api',
        secret: 'attacker-secret-attacker-secret-attacker',
        expiresIn: '15m',
      },
    );

    await expect(service.verifyAccessToken(token, 'app')).resolves.toBeNull();
  });

  it('rejects a token that has already expired', async () => {
    const service = createService({ 'auth.accessTtl': '0s' });
    const token = await service.issueAccessToken(
      { id: 'user-1', role: 'school_admin' },
      'app',
    );

    await expect(service.verifyAccessToken(token, 'app')).resolves.toBeNull();
  });

  it('rejects garbage input', async () => {
    const service = createService();

    await expect(
      service.verifyAccessToken('not-a-jwt', 'app'),
    ).resolves.toBeNull();
  });
});
