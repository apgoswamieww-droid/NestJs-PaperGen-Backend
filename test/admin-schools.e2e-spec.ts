import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import {
  MailService,
  type PasswordInviteDetails,
} from '../src/mail/mail.service.js';
import { PasswordResetToken } from '../src/schemas/password-reset-token.schema.js';
import { PlatformAdmin } from '../src/schemas/platform-admin.schema.js';
import { Tenant } from '../src/schemas/tenant.schema.js';
import { User } from '../src/schemas/user.schema.js';

const SUPER_EMAIL = 'owner@papergen.app';
const SUPPORT_EMAIL = 'support@papergen.app';
const SEEDED_USER_EMAIL = 'dupe@demo.school';
const PASSWORD = 'Platform@12345';
const INVITE_PASSWORD = 'Invited@12345';
const SEED_SLUG = 'demo-public-school';

let app: INestApplication;
let mongo: MongoMemoryServer;
let sendPasswordReset: ReturnType<typeof vi.fn>;
let sendPasswordInvite: ReturnType<typeof vi.fn>;
let seededTenantId: string;

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

function lastInviteUrl(): string {
  const calls = sendPasswordInvite.mock.calls;

  if (calls.length === 0) {
    throw new Error('No invitation email was sent.');
  }

  return (calls[calls.length - 1][0] as PasswordInviteDetails).url;
}

function tokenFrom(url: string): string {
  return new URL(url).searchParams.get('token') ?? '';
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

async function superAdminToken(): Promise<string> {
  const response = await adminLogin(SUPER_EMAIL, PASSWORD).expect(200);

  return response.body.accessToken as string;
}

function createSchool(token: string, overrides: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .post('/api/admin/schools')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Sunrise Public School',
      type: 'school',
      city: 'Nagpur',
      plan: 'growth',
      adminName: 'Sunrise Principal',
      adminEmail: 'principal@sunrise.test',
      ...overrides,
    });
}

function patchStatus(token: string, id: string, status: string) {
  return request(app.getHttpServer())
    .patch(`/api/admin/schools/${id}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status });
}

function patchBilling(
  token: string,
  id: string,
  body: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .patch(`/api/admin/schools/${id}/billing`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

function reset(scope: 'app' | 'admin', token: string, password: string) {
  const path = scope === 'admin' ? 'admin/auth' : 'auth';

  return request(app.getHttpServer())
    .post(`/api/${path}/reset-password`)
    .send({ token, password });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-schools-test');
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
  sendPasswordInvite = vi.fn().mockResolvedValue(undefined);

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MailService)
    .useValue({ sendPasswordReset, sendPasswordInvite })
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
    slug: SEED_SLUG,
    type: 'school',
    city: '',
    status: 'active',
    plan: 'starter',
  });

  seededTenantId = tenant._id.toString();

  const passwordHash = await passwordService.hash(PASSWORD);

  await userModel.create({
    tenantId: tenant._id,
    email: SEEDED_USER_EMAIL,
    name: 'Demo Teacher',
    role: 'teacher',
    passwordHash,
    status: 'active',
  });

  await adminModel.create([
    {
      email: SUPER_EMAIL,
      name: 'Platform Owner',
      role: 'super_admin',
      passwordHash,
      status: 'active',
    },
    {
      email: SUPPORT_EMAIL,
      name: 'Platform Support',
      role: 'support',
      passwordHash,
      status: 'active',
    },
  ]);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

describe('Admin schools (e2e)', () => {
  beforeEach(() => {
    sendPasswordReset.mockClear();
    sendPasswordInvite.mockClear();
  });

  describe('access control', () => {
    it('requires an admin token', async () => {
      await request(app.getHttpServer()).get('/api/admin/schools').expect(401);
    });

    it('rejects school-scope tokens', async () => {
      const response = await login(SEEDED_USER_EMAIL, PASSWORD).expect(200);

      await request(app.getHttpServer())
        .get('/api/admin/schools')
        .set('Authorization', `Bearer ${response.body.accessToken as string}`)
        .expect(401);
    });

    it('forbids support admins from listing, registering or suspending schools', async () => {
      const support = await adminLogin(SUPPORT_EMAIL, PASSWORD).expect(200);
      const token = support.body.accessToken as string;

      await request(app.getHttpServer())
        .get('/api/admin/schools')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await createSchool(token).expect(403);
      await patchStatus(token, seededTenantId, 'suspended').expect(403);

      await request(app.getHttpServer())
        .patch(`/api/admin/schools/${seededTenantId}/billing`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subscriptionStatus: 'cancelled' })
        .expect(403);

      expect(sendPasswordInvite).not.toHaveBeenCalled();
    });
  });

  describe('registration', () => {
    it('registers a school, emails an invite and lets the admin sign in', async () => {
      const token = await superAdminToken();
      const response = await createSchool(token).expect(201);

      expect(response.body.school).toMatchObject({
        name: 'Sunrise Public School',
        slug: 'sunrise-public-school',
        type: 'school',
        city: 'Nagpur',
        plan: 'growth',
        planName: 'Growth',
        status: 'active',
        userCount: 1,
        billingCycle: 'monthly',
        subscriptionStatus: 'active',
        priceOverride: null,
      });
      expect(typeof response.body.school.renewalAt).toBe('string');
      expect(response.body.school.trialEndsAt).toBeNull();
      expect(response.body.invite).toEqual({
        email: 'principal@sunrise.test',
        expiresInHours: 72,
        sent: true,
      });

      const url = lastInviteUrl();

      expect(url).toContain('http://localhost:4200/reset-password?token=');

      const inviteToken = tokenFrom(url);

      expect(inviteToken).toHaveLength(43);

      const inviteDetails = sendPasswordInvite.mock.calls[0][0] as
        PasswordInviteDetails | undefined;

      expect(inviteDetails?.tenantName).toBe('Sunrise Public School');
      expect(inviteDetails?.to).toBe('principal@sunrise.test');

      const tokenModel = app.get<Model<PasswordResetToken>>(
        getModelToken(PasswordResetToken.name),
      );
      const record = await tokenModel
        .findOne({ email: 'principal@sunrise.test' })
        .exec();
      const remaining = (record?.expiresAt.getTime() ?? 0) - Date.now();

      expect(remaining).toBeGreaterThan(71 * 60 * 60_000);

      await reset('app', inviteToken, INVITE_PASSWORD).expect(204);

      const loginResponse = await login(
        'principal@sunrise.test',
        INVITE_PASSWORD,
      ).expect(200);

      expect(loginResponse.body.user.tenantName).toBe('Sunrise Public School');
      expect(loginResponse.body.user.role).toBe('school_admin');

      const me = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set(
          'Authorization',
          `Bearer ${loginResponse.body.accessToken as string}`,
        )
        .expect(200);

      expect(me.body.tenantName).toBe('Sunrise Public School');
    });

    it('rejects an invitation token on the admin reset endpoint but keeps it usable for the school scope', async () => {
      const token = await superAdminToken();

      await createSchool(token, {
        name: 'Meridian Tutorials',
        adminEmail: 'meridian@tutorials.test',
      }).expect(201);

      const inviteToken = tokenFrom(lastInviteUrl());

      await reset('admin', inviteToken, INVITE_PASSWORD).expect(400);
      await reset('app', inviteToken, INVITE_PASSWORD).expect(204);
      await login('meridian@tutorials.test', INVITE_PASSWORD).expect(200);
    });
  });

  describe('duplicates and validation', () => {
    it('rejects a school admin email that already exists', async () => {
      const token = await superAdminToken();
      const response = await createSchool(token, {
        adminEmail: SEEDED_USER_EMAIL,
      }).expect(409);

      expect(response.body.message).toContain('already exists');
    });

    it('suffixes the slug when school names collide', async () => {
      const token = await superAdminToken();
      const first = await createSchool(token, {
        name: 'Twin Valley School',
        adminEmail: 'twin-1@demo.test',
      }).expect(201);
      const second = await createSchool(token, {
        name: 'Twin Valley School',
        adminEmail: 'twin-2@demo.test',
      }).expect(201);

      expect(first.body.school.slug).toBe('twin-valley-school');
      expect(second.body.school.slug).toBe('twin-valley-school-2');
    });

    it('validates registration payloads', async () => {
      const token = await superAdminToken();

      await createSchool(token, { plan: 'enterprise' }).expect(400);
      await createSchool(token, { type: 'academy' }).expect(400);
      await createSchool(token, { adminEmail: 'not-an-email' }).expect(400);
      await createSchool(token, { name: 'X' }).expect(400);
      await createSchool(token, { city: 'x'.repeat(81) }).expect(400);
      await createSchool(token, { adminName: '' }).expect(400);
    });
  });

  describe('listing', () => {
    it('lists seeded and registered schools with user counts', async () => {
      const token = await superAdminToken();
      const response = await request(app.getHttpServer())
        .get('/api/admin/schools')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const rows = response.body as {
        slug: string;
        type: string;
        city: string;
        plan: string;
        status: string;
        userCount: number;
        createdAt: string;
      }[];

      const seed = rows.find((row) => row.slug === SEED_SLUG);

      expect(seed).toMatchObject({
        name: 'Demo Public School',
        type: 'school',
        city: '',
        plan: 'starter',
        status: 'active',
        userCount: 1,
      });

      const sunrise = rows.find((row) => row.slug === 'sunrise-public-school');

      expect(sunrise).toBeDefined();
      expect(sunrise?.userCount).toBe(1);
      expect(typeof sunrise?.createdAt).toBe('string');
    });
  });

  describe('status management', () => {
    it('suspends and reactivates a school, blocking logins and sessions while suspended', async () => {
      const token = await superAdminToken();
      const created = await createSchool(token, {
        name: 'Northwind Institute',
        type: 'institute',
        plan: 'scale',
        city: 'Pune',
        adminEmail: 'north@institute.test',
      }).expect(201);

      const id = created.body.school.id as string;

      await reset('app', tokenFrom(lastInviteUrl()), INVITE_PASSWORD).expect(
        204,
      );

      const before = await login(
        'north@institute.test',
        INVITE_PASSWORD,
      ).expect(200);
      const cookie = refreshCookie(before, 'pg_rt') ?? '';

      expect(cookie).not.toBe('');

      const suspended = await patchStatus(token, id, 'suspended').expect(200);

      expect(suspended.body.status).toBe('suspended');

      const blocked = await login(
        'north@institute.test',
        INVITE_PASSWORD,
      ).expect(403);

      expect(blocked.body.message).toContain('suspended');

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);

      const reactivated = await patchStatus(token, id, 'active').expect(200);

      expect(reactivated.body.status).toBe('active');

      await login('north@institute.test', INVITE_PASSWORD).expect(200);
    });

    it('returns 404 for unknown schools and 400 for unknown statuses', async () => {
      const token = await superAdminToken();

      await patchStatus(token, 'not-an-id', 'active').expect(404);
      await patchStatus(
        token,
        new Types.ObjectId().toString(),
        'active',
      ).expect(404);
      await patchStatus(token, seededTenantId, 'paused').expect(400);
    });

    it('keeps the seeded school active after the failed support attempt', async () => {
      const token = await superAdminToken();
      const response = await request(app.getHttpServer())
        .get('/api/admin/schools')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const rows = response.body as { slug: string; status: string }[];
      const seed = rows.find((row) => row.slug === SEED_SLUG);

      expect(seed?.status).toBe('active');
    });
  });

  describe('billing management', () => {
    it('updates plan, cycle, status, dates and price override', async () => {
      const token = await superAdminToken();
      const created = await createSchool(token, {
        name: 'Billing Academy',
        adminEmail: 'billing@academy.test',
      }).expect(201);
      const id = created.body.school.id as string;

      const updated = await patchBilling(token, id, {
        plan: 'scale',
        billingCycle: 'annual',
        subscriptionStatus: 'trial',
        renewalAt: '2026-12-31T00:00:00.000Z',
        trialEndsAt: '2026-11-15T00:00:00.000Z',
        priceOverride: 1999,
      }).expect(200);

      expect(updated.body).toMatchObject({
        plan: 'scale',
        planName: 'Scale',
        billingCycle: 'annual',
        subscriptionStatus: 'trial',
        priceOverride: 1999,
      });
      expect(updated.body.renewalAt).toBe('2026-12-31T00:00:00.000Z');
      expect(updated.body.trialEndsAt).toBe('2026-11-15T00:00:00.000Z');

      const cleared = await patchBilling(token, id, {
        renewalAt: null,
        trialEndsAt: null,
        priceOverride: null,
      }).expect(200);

      expect(cleared.body.renewalAt).toBeNull();
      expect(cleared.body.trialEndsAt).toBeNull();
      expect(cleared.body.priceOverride).toBeNull();

      const detail = await request(app.getHttpServer())
        .get(`/api/admin/schools/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(detail.body.school).toMatchObject({
        billingCycle: 'annual',
        subscriptionStatus: 'trial',
        planName: 'Scale',
      });
    });

    it('rejects unknown plans, invalid payloads and unknown schools', async () => {
      const token = await superAdminToken();

      await patchBilling(token, seededTenantId, { plan: 'enterprise' }).expect(
        400,
      );
      await patchBilling(token, seededTenantId, {
        billingCycle: 'weekly',
      }).expect(400);
      await patchBilling(token, seededTenantId, {
        subscriptionStatus: 'paused',
      }).expect(400);
      await patchBilling(token, seededTenantId, {
        renewalAt: 'tomorrow',
      }).expect(400);
      await patchBilling(token, seededTenantId, { priceOverride: -5 }).expect(
        400,
      );

      await patchBilling(token, 'not-an-id', { plan: 'starter' }).expect(404);
      await patchBilling(token, new Types.ObjectId().toString(), {
        plan: 'starter',
      }).expect(404);
    });
  });
});
