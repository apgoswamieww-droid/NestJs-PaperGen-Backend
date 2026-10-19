import type { ConfigService } from '@nestjs/config';
import { Types, type Model } from 'mongoose';
import { PasswordResetToken } from '../schemas/password-reset-token.schema.js';
import { PasswordResetService } from './password-reset.service.js';

interface TokenRecord {
  _id: string;
  subjectId: Types.ObjectId;
  subjectType: 'app' | 'admin';
  expiresAt: Date;
  usedAt: Date | null;
}

interface ModelMock {
  updateMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  findOneAndUpdate: ReturnType<typeof vi.fn>;
}

function createModelMock(): ModelMock {
  return {
    updateMany: vi.fn(() => ({
      exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    })),
    create: vi.fn().mockResolvedValue({}),
    findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(null) })),
    findOneAndUpdate: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(null) })),
  };
}

function createService(model: ModelMock): PasswordResetService {
  const configService = {
    getOrThrow: (key: string) =>
      key === 'mail.resetTtlMinutes' ? 30 : undefined,
  } as unknown as ConfigService;

  return new PasswordResetService(
    configService,
    model as unknown as Model<PasswordResetToken>,
  );
}

const SUBJECT_ID = new Types.ObjectId();
const META = { ip: '127.0.0.1', userAgent: 'vitest' };

function record(overrides: Partial<TokenRecord> = {}): TokenRecord {
  return {
    _id: 'token-1',
    subjectId: SUBJECT_ID,
    subjectType: 'app',
    expiresAt: new Date(Date.now() + 10 * 60_000),
    usedAt: null,
    ...overrides,
  };
}

function withResolved<T>(value: T) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

describe('PasswordResetService', () => {
  it('issues a token, invalidates older links and stores only a hash', async () => {
    const model = createModelMock();
    const service = createService(model);

    const issue = await service.create('app', SUBJECT_ID, 'a@b.co', META);

    expect(issue.token).toHaveLength(43);
    expect(issue.expiresInMinutes).toBe(30);

    expect(model.updateMany).toHaveBeenCalledWith(
      { subjectId: SUBJECT_ID, subjectType: 'app', usedAt: null },
      { $set: { usedAt: expect.any(Date) as unknown } },
    );

    const created = model.create.mock.calls[0][0] as {
      tokenHash: string;
      expiresAt: Date;
      subjectType: string;
      email: string;
    };

    expect(created.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(created.tokenHash).not.toBe(issue.token);
    expect(created.subjectType).toBe('app');
    expect(created.email).toBe('a@b.co');
    expect(created.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      29 * 60_000,
    );
    expect(created.expiresAt.getTime() - Date.now()).toBeLessThan(31 * 60_000);
  });

  it('honours an explicit TTL override (invitations)', async () => {
    const model = createModelMock();
    const service = createService(model);

    const issue = await service.create(
      'app',
      SUBJECT_ID,
      'a@b.co',
      META,
      72 * 60,
    );

    expect(issue.expiresInMinutes).toBe(4320);

    const created = model.create.mock.calls[0][0] as { expiresAt: Date };
    const remaining = created.expiresAt.getTime() - Date.now();

    expect(remaining).toBeGreaterThan(71 * 60 * 60_000);
    expect(remaining).toBeLessThan(73 * 60 * 60_000);
  });

  it('returns null for an unknown token', async () => {
    const model = createModelMock();
    const service = createService(model);

    await expect(service.redeem('garbage-token', 'app')).resolves.toBeNull();
  });

  it('rejects tokens issued for the other scope', async () => {
    const model = createModelMock();
    const service = createService(model);
    model.findOne.mockReturnValueOnce(
      withResolved(record({ subjectType: 'admin' })),
    );

    await expect(service.redeem('some-token', 'app')).resolves.toBeNull();
  });

  it('rejects tokens that were already used', async () => {
    const model = createModelMock();
    const service = createService(model);
    model.findOne.mockReturnValueOnce(
      withResolved(record({ usedAt: new Date() })),
    );

    await expect(service.redeem('some-token', 'app')).resolves.toBeNull();
  });

  it('rejects expired tokens', async () => {
    const model = createModelMock();
    const service = createService(model);
    model.findOne.mockReturnValueOnce(
      withResolved(record({ expiresAt: new Date(Date.now() - 1000) })),
    );

    await expect(service.redeem('some-token', 'app')).resolves.toBeNull();
  });

  it('claims a valid token and returns the subject id', async () => {
    const model = createModelMock();
    const service = createService(model);
    model.findOne.mockReturnValueOnce(withResolved(record()));
    model.findOneAndUpdate.mockReturnValueOnce(
      withResolved({ subjectId: SUBJECT_ID }),
    );

    await expect(service.redeem('some-token', 'app')).resolves.toBe(SUBJECT_ID);
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'token-1', usedAt: null },
      { $set: { usedAt: expect.any(Date) as unknown } },
      { returnDocument: 'after' },
    );
  });

  it('returns null when the claim loses a concurrent race', async () => {
    const model = createModelMock();
    const service = createService(model);
    model.findOne.mockReturnValueOnce(withResolved(record()));

    await expect(service.redeem('some-token', 'app')).resolves.toBeNull();
  });
});
