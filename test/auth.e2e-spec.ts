import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import { PlatformAdmin } from '../src/schemas/platform-admin.schema.js';
import { Tenant } from '../src/schemas/tenant.schema.js';
import { User } from '../src/schemas/user.schema.js';

const SCHOOL_EMAIL = 'admin@demo.school';
const SCHOOL_PASSWORD = 'School@12345';
const EXPIRED_EMAIL = 'expired@demo.school';
const EXPIRED_NEW_PASSWORD = 'NewSchool@12345';
const LOCK_EMAIL = 'lockme@demo.school';
const WRONG_EMAIL = 'wrong@demo.school';
const SUSPENDED_EMAIL = 'suspended@demo.school';
const SUSPENDED_SCHOOL_EMAIL = 'closed-school@demo.school';
const ADMIN_EMAIL = 'owner@papergen.app';
const ADMIN_PASSWORD = 'Platform@12345';

let app: INestApplication;
let mongo: MongoMemoryServer;

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

function cookieExpiresInMs(cookie: string): number {
  const match = /Expires=([^;]+)/.exec(cookie);

  return match ? Date.parse(match[1]) - Date.now() : Number.NaN;
}

function login(email: string, password: string, remember = false) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember });
}

function adminLogin(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/admin/auth/login')
    .send({ email, password });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-auth-test');
  process.env['JWT_APP_ACCESS_SECRET'] =
    'e2e-app-secret-0123456789abcdefghijklmnopqrstuvwxyz';
  process.env['JWT_ADMIN_ACCESS_SECRET'] =
    'e2e-admin-secret-0123456789abcdefghijklmnopqrstuv';
  process.env['JWT_ACCESS_TTL'] = '15m';
  process.env['THROTTLE_LIMIT'] = '1000';
  process.env['THROTTLE_TTL_SECONDS'] = '60';
  process.env['AUTH_LOCKOUT_ATTEMPTS'] = '3';
  process.env['AUTH_LOCKOUT_MINUTES'] = '15';

  const { AppModule } = await import('./../src/app.module.js');
  const { configureApp } = await import('./../src/configure-app.js');

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

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
  const closedTenant = await tenantModel.create({
    name: 'Closed School',
    slug: 'closed-school',
    status: 'suspended',
    plan: 'starter',
  });

  const schoolPasswordHash = await passwordService.hash(SCHOOL_PASSWORD);
  const adminPasswordHash = await passwordService.hash(ADMIN_PASSWORD);

  await userModel.create([
    {
      tenantId: tenant._id,
      email: SCHOOL_EMAIL,
      name: 'Demo School Admin',
      role: 'school_admin',
      passwordHash: schoolPasswordHash,
      status: 'active',
    },
    {
      tenantId: tenant._id,
      email: LOCK_EMAIL,
      name: 'Lock Me',
      role: 'teacher',
      passwordHash: schoolPasswordHash,
      status: 'active',
    },
    {
      tenantId: tenant._id,
      email: WRONG_EMAIL,
      name: 'Wrong Pass',
      role: 'teacher',
      passwordHash: schoolPasswordHash,
      status: 'active',
    },
    {
      tenantId: tenant._id,
      email: SUSPENDED_EMAIL,
      name: 'Suspended User',
      role: 'teacher',
      passwordHash: schoolPasswordHash,
      status: 'suspended',
    },
    {
      tenantId: tenant._id,
      email: EXPIRED_EMAIL,
      name: 'Expired Password',
      role: 'school_admin',
      passwordHash: schoolPasswordHash,
      status: 'active',
      passwordChangedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
    },
    {
      tenantId: closedTenant._id,
      email: SUSPENDED_SCHOOL_EMAIL,
      name: 'Closed School User',
      role: 'school_admin',
      passwordHash: schoolPasswordHash,
      status: 'active',
    },
  ]);

  await adminModel.create({
    email: ADMIN_EMAIL,
    name: 'Platform Owner',
    role: 'super_admin',
    passwordHash: adminPasswordHash,
    status: 'active',
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

describe('School auth (e2e)', () => {
  it('logs in and returns an access token, profile and a httpOnly refresh cookie', async () => {
    const response = await login(SCHOOL_EMAIL, SCHOOL_PASSWORD).expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({
      name: 'Demo School Admin',
      email: SCHOOL_EMAIL,
      role: 'school_admin',
      tenantName: 'Demo Public School',
    });

    const cookie = setCookies(response).find((value) =>
      value.startsWith('pg_rt='),
    );

    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/auth');
  });

  it('accepts emails case-insensitively', async () => {
    await login(SCHOOL_EMAIL.toUpperCase(), SCHOOL_PASSWORD).expect(200);
  });

  it('sets a short-lived cookie by default and a long-lived one for remember', async () => {
    const short = await login(SCHOOL_EMAIL, SCHOOL_PASSWORD).expect(200);
    const remember = await login(SCHOOL_EMAIL, SCHOOL_PASSWORD, true).expect(
      200,
    );

    const shortCookie =
      setCookies(short).find((value) => value.startsWith('pg_rt=')) ?? '';
    const rememberCookie =
      setCookies(remember).find((value) => value.startsWith('pg_rt=')) ?? '';

    const hours = 60 * 60 * 1000;

    expect(cookieExpiresInMs(shortCookie)).toBeGreaterThan(11 * hours);
    expect(cookieExpiresInMs(shortCookie)).toBeLessThan(13 * hours);
    expect(cookieExpiresInMs(rememberCookie)).toBeGreaterThan(20 * 24 * hours);
  });

  it('rejects a wrong password with a generic message', async () => {
    const response = await login(WRONG_EMAIL, 'WrongPassword1').expect(401);

    expect(response.body.message).toBe('Invalid email or password.');
  });

  it('rejects an unknown email with the same generic message', async () => {
    const response = await login('nobody@demo.school', 'WrongPassword1').expect(
      401,
    );

    expect(response.body.message).toBe('Invalid email or password.');
  });

  it('rejects malformed payloads', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: SCHOOL_EMAIL,
        password: SCHOOL_PASSWORD,
        unexpected: true,
      })
      .expect(400);
  });

  it('locks the account after repeated failed attempts', async () => {
    await login(LOCK_EMAIL, 'WrongPassword1').expect(401);
    await login(LOCK_EMAIL, 'WrongPassword1').expect(401);
    await login(LOCK_EMAIL, 'WrongPassword1').expect(401);

    const response = await login(LOCK_EMAIL, SCHOOL_PASSWORD).expect(423);

    expect(response.body.message).toContain('Too many failed attempts');
  });

  it('rejects suspended accounts and suspended schools', async () => {
    const suspended = await login(SUSPENDED_EMAIL, SCHOOL_PASSWORD).expect(403);
    const closed = await login(SUSPENDED_SCHOOL_EMAIL, SCHOOL_PASSWORD).expect(
      403,
    );

    expect(suspended.body.message).toBe('This account has been suspended.');
    expect(closed.body.message).toBe('This school account has been suspended.');
  });

  it('returns the profile from /api/auth/me and protects it', async () => {
    const loginResponse = await login(SCHOOL_EMAIL, SCHOOL_PASSWORD).expect(
      200,
    );
    const { accessToken } = loginResponse.body as { accessToken: string };

    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer broken-token')
      .expect(401);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(me.body).toMatchObject({
      email: SCHOOL_EMAIL,
      role: 'school_admin',
    });
  });

  it('rotates refresh tokens and revokes the family on replay', async () => {
    const loginResponse = await login(SCHOOL_EMAIL, SCHOOL_PASSWORD).expect(
      200,
    );
    const first = refreshCookie(loginResponse, 'pg_rt');

    expect(first).not.toBeNull();

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', first ?? '')
      .expect(200);

    expect(refreshed.body.accessToken).toEqual(expect.any(String));

    const second = refreshCookie(refreshed, 'pg_rt');

    expect(second).not.toBeNull();
    expect(second).not.toBe(first);

    // Replaying the rotated token is treated as theft: 401 and family revoked.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', first ?? '')
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', second ?? '')
      .expect(401);
  });

  it('rejects refresh without a cookie', async () => {
    await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
  });

  it('revokes the session on logout', async () => {
    const loginResponse = await login(SCHOOL_EMAIL, SCHOOL_PASSWORD).expect(
      200,
    );
    const cookie = refreshCookie(loginResponse, 'pg_rt') ?? '';

    const logout = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204);

    expect(
      setCookies(logout).some((value) => value.startsWith('pg_rt=;')),
    ).toBe(true);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('rejects school tokens on admin endpoints and vice versa', async () => {
    const school = await login(SCHOOL_EMAIL, SCHOOL_PASSWORD).expect(200);
    const admin = await adminLogin(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);

    await request(app.getHttpServer())
      .get('/api/admin/auth/me')
      .set('Authorization', `Bearer ${school.body.accessToken as string}`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${admin.body.accessToken as string}`)
      .expect(401);
  });
});

describe('Password expiry and change (e2e)', () => {
  function changePassword(
    accessToken: string,
    currentPassword: string,
    newPassword: string,
  ) {
    return request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword, newPassword });
  }

  async function accessTokenFor(
    email: string,
    password: string,
  ): Promise<string> {
    const response = await login(email, password).expect(200);

    return (response.body as { accessToken: string }).accessToken;
  }

  it('flags an expired password and blocks protected endpoints', async () => {
    const loginResponse = await login(EXPIRED_EMAIL, SCHOOL_PASSWORD).expect(
      200,
    );

    expect(loginResponse.body.user.passwordExpired).toBe(true);

    const token = (loginResponse.body as { accessToken: string }).accessToken;
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(me.body.passwordExpired).toBe(true);

    const blocked = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(blocked.body.code).toBe('PASSWORD_EXPIRED');
  });

  it('requires the current password and rejects reusing it', async () => {
    const token = await accessTokenFor(EXPIRED_EMAIL, SCHOOL_PASSWORD);

    const wrong = await changePassword(
      token,
      'WrongPassword1',
      EXPIRED_NEW_PASSWORD,
    ).expect(400);

    expect(wrong.body.message).toBe('Your current password is incorrect.');

    const same = await changePassword(
      token,
      SCHOOL_PASSWORD,
      SCHOOL_PASSWORD,
    ).expect(400);

    expect(same.body.message).toBe(
      'New password must be different from your current password.',
    );
  });

  it('changes the password, rotates the session and clears the expiry', async () => {
    const token = await accessTokenFor(EXPIRED_EMAIL, SCHOOL_PASSWORD);

    const changed = await changePassword(
      token,
      SCHOOL_PASSWORD,
      EXPIRED_NEW_PASSWORD,
    ).expect(200);

    expect(changed.body.user.passwordExpired).toBe(false);
    expect(refreshCookie(changed, 'pg_rt')).not.toBeNull();

    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${changed.body.accessToken as string}`)
      .expect(200);

    await login(EXPIRED_EMAIL, SCHOOL_PASSWORD).expect(401);
    await login(EXPIRED_EMAIL, EXPIRED_NEW_PASSWORD).expect(200);
  });

  it('does not flag a recently changed password as expired', async () => {
    const response = await login(SCHOOL_EMAIL, SCHOOL_PASSWORD).expect(200);

    expect(response.body.user.passwordExpired).toBe(false);
  });
});

describe('Platform admin auth (e2e)', () => {
  it('logs in with its own cookie and returns the profile', async () => {
    const response = await adminLogin(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);

    expect(response.body.user).toMatchObject({
      email: ADMIN_EMAIL,
      role: 'super_admin',
    });

    const cookie = setCookies(response).find((value) =>
      value.startsWith('pg_admin_rt='),
    );

    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/admin/auth');

    const me = await request(app.getHttpServer())
      .get('/api/admin/auth/me')
      .set('Authorization', `Bearer ${response.body.accessToken as string}`)
      .expect(200);

    expect(me.body).toMatchObject({ email: ADMIN_EMAIL, role: 'super_admin' });
  });

  it('rejects bad credentials', async () => {
    await adminLogin(ADMIN_EMAIL, 'WrongPassword1').expect(401);
  });

  it('rotates and revokes admin refresh tokens independently of school sessions', async () => {
    const school = await login(SCHOOL_EMAIL, SCHOOL_PASSWORD).expect(200);
    const schoolCookie = refreshCookie(school, 'pg_rt') ?? '';
    const admin = await adminLogin(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);
    const adminCookie = refreshCookie(admin, 'pg_admin_rt') ?? '';

    await request(app.getHttpServer())
      .post('/api/admin/auth/logout')
      .set('Cookie', adminCookie)
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/admin/auth/refresh')
      .set('Cookie', adminCookie)
      .expect(401);

    // The school session must still be intact.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', schoolCookie)
      .expect(200);
  });
});
