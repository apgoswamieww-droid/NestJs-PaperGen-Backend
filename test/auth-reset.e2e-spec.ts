import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import request from 'supertest';
import { FORGOT_PASSWORD_MESSAGE } from '../src/auth/auth.service.js';
import { PasswordService } from '../src/auth/password.service.js';
import {
  MailService,
  type PasswordResetDetails,
} from '../src/mail/mail.service.js';
import { PlatformAdmin } from '../src/schemas/platform-admin.schema.js';
import { Tenant } from '../src/schemas/tenant.schema.js';
import { User } from '../src/schemas/user.schema.js';

const HAPPY_EMAIL = 'reset-ok@demo.school';
const REVOKE_EMAIL = 'revoke@demo.school';
const LOCKED_EMAIL = 'lockme2@demo.school';
const SUSPENDED_EMAIL = 'suspended-reset@demo.school';
const ADMIN_EMAIL = 'owner@papergen.app';
const OLD_PASSWORD = 'OldPassword@123';
const NEW_PASSWORD = 'NewPassword@456';

let app: INestApplication;
let mongo: MongoMemoryServer;
let sendPasswordReset: ReturnType<typeof vi.fn>;

function setCookies(response: request.Response): string[] {
  const header = response.headers['set-cookie'] as unknown;

  if (Array.isArray(header)) {
    return header.map((value) => String(value));
  }

  return typeof header === 'string' ? [header] : [];
}

function refreshCookie(
  response: request.Response,
  name: string,
): string | null {
  const cookie = setCookies(response).find((value) =>
    value.startsWith(`${name}=`),
  );

  return cookie ? cookie.split(';')[0] : null;
}

function lastResetUrl(): string {
  const calls = sendPasswordReset.mock.calls;

  if (calls.length === 0) {
    throw new Error('No password reset email was sent.');
  }

  return (calls[calls.length - 1][0] as PasswordResetDetails).url;
}

function tokenFrom(url: string): string {
  return new URL(url).searchParams.get('token') ?? '';
}

function forgot(scope: 'app' | 'admin', email: string) {
  const path = scope === 'admin' ? 'admin/auth' : 'auth';

  return request(app.getHttpServer())
    .post(`/api/${path}/forgot-password`)
    .send({ email });
}

function reset(scope: 'app' | 'admin', token: string, password: string) {
  const path = scope === 'admin' ? 'admin/auth' : 'auth';

  return request(app.getHttpServer())
    .post(`/api/${path}/reset-password`)
    .send({ token, password });
}

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

function adminLogin(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/admin/auth/login')
    .send({ email, password });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-reset-test');
  process.env['JWT_APP_ACCESS_SECRET'] =
    'e2e-app-secret-0123456789abcdefghijklmnopqrstuvwxyz';
  process.env['JWT_ADMIN_ACCESS_SECRET'] =
    'e2e-admin-secret-0123456789abcdefghijklmnopqrstuv';
  process.env['JWT_ACCESS_TTL'] = '15m';
  process.env['THROTTLE_LIMIT'] = '1000';
  process.env['THROTTLE_TTL_SECONDS'] = '60';
  process.env['AUTH_LOCKOUT_ATTEMPTS'] = '3';
  process.env['AUTH_LOCKOUT_MINUTES'] = '15';
  process.env['APP_URL'] = 'http://localhost:4200';

  const { AppModule } = await import('./../src/app.module.js');
  const { configureApp } = await import('./../src/configure-app.js');

  sendPasswordReset = vi.fn().mockResolvedValue(undefined);

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MailService)
    .useValue({ sendPasswordReset })
    .compile();

  app = configureApp(moduleFixture.createNestApplication());
  await app.init();

  const passwordService = app.get(PasswordService);
  const tenantModel = app.get<Model<Tenant>>(getModelToken(Tenant.name));
  const userModel = app.get<Model<User>>(getModelToken(User.name));
  const adminModel = app.get<Model<PlatformAdmin>>(
    getModelToken(PlatformAdmin.name),
  );

  const tenant = await tenantModel.create({
    name: 'Demo Public School',
    slug: 'demo-public-school',
    status: 'active',
    plan: 'starter',
  });
  const passwordHash = await passwordService.hash(OLD_PASSWORD);

  await userModel.create([
    {
      tenantId: tenant._id,
      email: HAPPY_EMAIL,
      name: 'Happy Reset',
      role: 'teacher',
      passwordHash,
      status: 'active',
    },
    {
      tenantId: tenant._id,
      email: REVOKE_EMAIL,
      name: 'Revoke Sessions',
      role: 'teacher',
      passwordHash,
      status: 'active',
    },
    {
      tenantId: tenant._id,
      email: LOCKED_EMAIL,
      name: 'Locked User',
      role: 'teacher',
      passwordHash,
      status: 'active',
    },
    {
      tenantId: tenant._id,
      email: SUSPENDED_EMAIL,
      name: 'Suspended User',
      role: 'teacher',
      passwordHash,
      status: 'suspended',
    },
  ]);

  await adminModel.create({
    email: ADMIN_EMAIL,
    name: 'Platform Owner',
    role: 'super_admin',
    passwordHash: await passwordService.hash(OLD_PASSWORD),
    status: 'active',
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

describe('Password reset (e2e)', () => {
  beforeEach(() => {
    sendPasswordReset.mockClear();
  });

  it('responds identically for unknown emails and sends nothing', async () => {
    const response = await forgot('app', 'nobody@demo.school').expect(200);

    expect(response.body).toEqual({ message: FORGOT_PASSWORD_MESSAGE });
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  it('never emails a suspended account or a school admin from the school scope', async () => {
    await forgot('app', SUSPENDED_EMAIL).expect(200);
    await forgot('app', ADMIN_EMAIL).expect(200);
    await forgot('admin', HAPPY_EMAIL).expect(200);

    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  it('rejects malformed forgot-password payloads', async () => {
    await forgot('app', 'not-an-email').expect(400);
  });

  it('sends a school reset link that resets the password exactly once', async () => {
    await forgot('app', HAPPY_EMAIL).expect(200);

    const url = lastResetUrl();

    expect(url).toContain('http://localhost:4200/reset-password?token=');

    const token = tokenFrom(url);

    expect(token).toHaveLength(43);

    await reset('app', token, NEW_PASSWORD).expect(204);

    await login(HAPPY_EMAIL, OLD_PASSWORD).expect(401);
    await login(HAPPY_EMAIL, NEW_PASSWORD).expect(200);

    // The link is single-use.
    const reuse = await reset('app', token, 'AnotherPass@789').expect(400);

    expect(reuse.body.message).toContain('invalid or has expired');

    await login(HAPPY_EMAIL, 'AnotherPass@789').expect(401);
  });

  it('rejects garbage and too-short tokens', async () => {
    await reset(
      'app',
      'garbage-token-that-is-long-enough',
      NEW_PASSWORD,
    ).expect(400);
    await reset('app', 'short', NEW_PASSWORD).expect(400);
  });

  it('invalidates a short password at the DTO level', async () => {
    await forgot('app', HAPPY_EMAIL).expect(200);
    const token = tokenFrom(lastResetUrl());

    await reset('app', token, 'weak').expect(400);
  });

  it('revokes existing sessions when the password is reset', async () => {
    const loginResponse = await login(REVOKE_EMAIL, OLD_PASSWORD).expect(200);
    const cookie = refreshCookie(loginResponse, 'pg_rt') ?? '';

    await forgot('app', REVOKE_EMAIL).expect(200);
    const token = tokenFrom(lastResetUrl());

    await reset('app', token, NEW_PASSWORD).expect(204);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);

    await login(REVOKE_EMAIL, NEW_PASSWORD).expect(200);
  });

  it('clears an active account lock when the password is reset', async () => {
    await login(LOCKED_EMAIL, 'WrongPassword1').expect(401);
    await login(LOCKED_EMAIL, 'WrongPassword1').expect(401);
    await login(LOCKED_EMAIL, 'WrongPassword1').expect(401);
    await login(LOCKED_EMAIL, OLD_PASSWORD).expect(423);

    await forgot('app', LOCKED_EMAIL).expect(200);
    const token = tokenFrom(lastResetUrl());

    await reset('app', token, NEW_PASSWORD).expect(204);
    await login(LOCKED_EMAIL, NEW_PASSWORD).expect(200);
  });

  it('issues an admin link, rejects it on the school endpoint and resets the admin password', async () => {
    await forgot('admin', ADMIN_EMAIL).expect(200);

    const url = lastResetUrl();

    expect(url).toContain('http://localhost:4200/admin/reset-password?token=');

    const token = tokenFrom(url);

    // A school account cannot redeem an admin token.
    await reset('app', token, NEW_PASSWORD).expect(400);

    await reset('admin', token, NEW_PASSWORD).expect(204);

    await adminLogin(ADMIN_EMAIL, OLD_PASSWORD).expect(401);
    await adminLogin(ADMIN_EMAIL, NEW_PASSWORD).expect(200);

    // The school workspace session of the same human is unaffected.
    await login(HAPPY_EMAIL, NEW_PASSWORD).expect(200);
  });
});
