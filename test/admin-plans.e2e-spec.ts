import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PlatformAdmin } from '../src/schemas/platform-admin.schema.js';
import { Tenant } from '../src/schemas/tenant.schema.js';

const SUPER_EMAIL = 'owner@papergen.app';
const SUPPORT_EMAIL = 'support@papergen.app';
const PASSWORD = 'Platform@12345';

let app: INestApplication;
let mongo: MongoMemoryServer;

function adminLogin(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/admin/auth/login')
    .send({ email, password });
}

async function superAdminToken(): Promise<string> {
  const response = await adminLogin(SUPER_EMAIL, PASSWORD).expect(200);

  return response.body.accessToken as string;
}

function listPlans(token: string) {
  return request(app.getHttpServer())
    .get('/api/admin/plans')
    .set('Authorization', `Bearer ${token}`);
}

function createPlan(token: string, overrides: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .post('/api/admin/plans')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Campus Pro', ...overrides });
}

function patchPlan(token: string, code: string, body: Record<string, unknown>) {
  return request(app.getHttpServer())
    .patch(`/api/admin/plans/${code}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

function deletePlan(token: string, code: string) {
  return request(app.getHttpServer())
    .delete(`/api/admin/plans/${code}`)
    .set('Authorization', `Bearer ${token}`);
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-plans-test');
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

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MailService)
    .useValue({
      sendPasswordReset: vi.fn().mockResolvedValue(undefined),
      sendPasswordInvite: vi.fn().mockResolvedValue(undefined),
    })
    .compile();

  app = configureApp(moduleFixture.createNestApplication());
  await app.init();

  const passwordService = app.get(PasswordService);
  const tenantModel = app.get<Model<Tenant>>(getModelToken(Tenant.name));
  const adminModel = app.get<Model<PlatformAdmin>>(
    getModelToken(PlatformAdmin.name),
  );

  await tenantModel.create([
    { name: 'Greenfield High', slug: 'greenfield-high', plan: 'growth' },
    { name: 'Riverside Academy', slug: 'riverside-academy', plan: 'growth' },
    { name: 'Hilltop School', slug: 'hilltop-school', plan: 'starter' },
  ]);

  const passwordHash = await passwordService.hash(PASSWORD);

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

describe('Admin plans (e2e)', () => {
  describe('access control', () => {
    it('requires an admin token', async () => {
      await request(app.getHttpServer()).get('/api/admin/plans').expect(401);
    });

    it('forbids support admins from managing plans', async () => {
      const support = await adminLogin(SUPPORT_EMAIL, PASSWORD).expect(200);
      const token = support.body.accessToken as string;

      await listPlans(token).expect(403);
      await createPlan(token).expect(403);
      await patchPlan(token, 'starter', { name: 'Renamed' }).expect(403);
      await deletePlan(token, 'starter').expect(403);
    });
  });

  describe('catalogue', () => {
    it('lists the seeded plans with tenant counts', async () => {
      const token = await superAdminToken();
      const response = await listPlans(token).expect(200);

      const rows = response.body as {
        code: string;
        name: string;
        monthlyPrice: number | null;
        featured: boolean;
        tenantCount: number;
      }[];

      expect(rows.map((row) => row.code)).toEqual([
        'starter',
        'growth',
        'scale',
      ]);
      expect(rows[0]).toMatchObject({
        name: 'Starter',
        monthlyPrice: 3999,
        featured: false,
        tenantCount: 1,
      });
      expect(rows[1]).toMatchObject({
        name: 'Growth',
        monthlyPrice: 8999,
        featured: true,
        tenantCount: 2,
      });
      expect(rows[2]).toMatchObject({
        name: 'Scale',
        monthlyPrice: null,
        tenantCount: 0,
      });
    });

    it('returns a plan by code and 404 for unknown codes', async () => {
      const token = await superAdminToken();
      const response = await request(app.getHttpServer())
        .get('/api/admin/plans/growth')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        code: 'growth',
        name: 'Growth',
        tenantCount: 2,
      });
      expect(response.body.limits).toEqual({
        maxStudents: 1200,
        maxTeachers: null,
        maxTotalUsers: null,
      });

      await request(app.getHttpServer())
        .get('/api/admin/plans/unknown')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('create, update and delete', () => {
    it('creates a plan with a generated code and suffixes duplicates', async () => {
      const token = await superAdminToken();
      const created = await createPlan(token, {
        name: 'Campus Pro',
        tagline: 'For large campuses.',
        monthlyPrice: 12999,
        annualPrice: 129990,
        features: ['Unlimited students', 'API access'],
        maxStudents: 2000,
        featured: true,
        sortOrder: 9,
      }).expect(201);

      expect(created.body).toMatchObject({
        code: 'campus-pro',
        name: 'Campus Pro',
        monthlyPrice: 12999,
        annualPrice: 129990,
        features: ['Unlimited students', 'API access'],
        featured: true,
        active: true,
        sortOrder: 9,
        tenantCount: 0,
      });
      expect(created.body.limits).toEqual({
        maxStudents: 2000,
        maxTeachers: null,
        maxTotalUsers: null,
      });

      const second = await createPlan(token, {
        name: 'Campus Pro',
      }).expect(201);

      expect(second.body.code).toBe('campus-pro-2');
    });

    it('validates create payloads', async () => {
      const token = await superAdminToken();

      await createPlan(token, { name: 'X' }).expect(400);
      await createPlan(token, { monthlyPrice: -1 }).expect(400);
      await createPlan(token, { monthlyPrice: 12.5 }).expect(400);
      await createPlan(token, {
        features: Array.from({ length: 13 }, (_, index) => `Feature ${index}`),
      }).expect(400);
      await createPlan(token, { tagline: 'x'.repeat(161) }).expect(400);
    });

    it('updates a plan and rejects invalid updates', async () => {
      const token = await superAdminToken();
      const updated = await patchPlan(token, 'campus-pro', {
        name: 'Campus Pro Max',
        monthlyPrice: 13999,
        annualPrice: null,
        active: false,
        maxTeachers: 50,
      }).expect(200);

      expect(updated.body).toMatchObject({
        code: 'campus-pro',
        name: 'Campus Pro Max',
        monthlyPrice: 13999,
        annualPrice: null,
        active: false,
      });
      expect(updated.body.limits).toMatchObject({ maxTeachers: 50 });

      await patchPlan(token, 'campus-pro', { monthlyPrice: -1 }).expect(400);
      await patchPlan(token, 'unknown-plan', { name: 'Nope' }).expect(404);
    });

    it('deletes unused plans but refuses plans with schools', async () => {
      const token = await superAdminToken();

      await deletePlan(token, 'growth').expect(409);
      await deletePlan(token, 'unknown-plan').expect(404);

      await deletePlan(token, 'campus-pro-2').expect(204);
      await request(app.getHttpServer())
        .get('/api/admin/plans/campus-pro-2')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      await deletePlan(token, 'campus-pro').expect(204);
    });
  });
});
