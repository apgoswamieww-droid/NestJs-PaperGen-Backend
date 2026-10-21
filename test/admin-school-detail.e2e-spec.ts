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
  type PasswordResetDetails,
} from '../src/mail/mail.service.js';
import { PasswordResetToken } from '../src/schemas/password-reset-token.schema.js';
import { PlatformAdmin } from '../src/schemas/platform-admin.schema.js';
import { Tenant } from '../src/schemas/tenant.schema.js';
import { User } from '../src/schemas/user.schema.js';

const SUPER_EMAIL = 'owner@papergen.app';
const SUPPORT_EMAIL = 'support@papergen.app';
const PASSWORD = 'Platform@12345';
const INVITE_PASSWORD = 'Invited@12345';
const GREENWOOD_SLUG = 'greenwood-high';
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let app: INestApplication;
let mongo: MongoMemoryServer;
let sendPasswordInvite: ReturnType<typeof vi.fn>;
let sendPasswordReset: ReturnType<typeof vi.fn>;
let greenwoodId: string;

function adminLogin(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/admin/auth/login')
    .send({ email, password });
}

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

async function adminToken(email: string): Promise<string> {
  const response = await adminLogin(email, PASSWORD).expect(200);

  return response.body.accessToken as string;
}

function detail(token: string, id: string) {
  return request(app.getHttpServer())
    .get(`/api/admin/schools/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

function patchSchool(
  token: string,
  id: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .patch(`/api/admin/schools/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function resendInvite(token: string, id: string) {
  return request(app.getHttpServer())
    .post(`/api/admin/schools/${id}/resend-invite`)
    .set('Authorization', `Bearer ${token}`);
}

function resetPassword(token: string, id: string) {
  return request(app.getHttpServer())
    .post(`/api/admin/schools/${id}/reset-password`)
    .set('Authorization', `Bearer ${token}`);
}

function createSchool(token: string, overrides: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .post('/api/admin/schools')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Riverside Public School',
      type: 'school',
      city: 'Nashik',
      plan: 'growth',
      adminName: 'Riverside Principal',
      adminEmail: 'riverside@demo.test',
      ...overrides,
    });
}

function lastInviteUrl(): string {
  const calls = sendPasswordInvite.mock.calls;

  if (calls.length === 0) {
    throw new Error('No invitation email was sent.');
  }

  return (calls[calls.length - 1][0] as PasswordInviteDetails).url;
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

function reset(token: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/reset-password')
    .send({ token, password });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-school-detail-test');
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

  sendPasswordInvite = vi.fn().mockResolvedValue(undefined);
  sendPasswordReset = vi.fn().mockResolvedValue(undefined);

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
  const resetTokenModel = app.get<Model<PasswordResetToken>>(
    getModelToken(PasswordResetToken.name),
  );

  const passwordHash = await passwordService.hash(PASSWORD);
  const pendingHash = await passwordService.hash(
    'unrecoverable-random-value-0123456789',
  );

  const greenwood = await tenantModel.create({
    name: 'Greenwood High',
    slug: GREENWOOD_SLUG,
    type: 'school',
    city: 'Nagpur',
    plan: 'growth',
    status: 'active',
    phone: '+91 98765 43210',
    email: 'office@greenwood.test',
    website: 'https://greenwood.test',
    addressLine1: '12 Vidya Marg',
    addressLine2: 'Civil Lines',
    state: 'Maharashtra',
    pincode: '440001',
    country: 'India',
    tagline: 'Excellence in every classroom.',
    brandColor: '#047857',
    board: 'cbse',
    affiliationNumber: 'CBSE/3300123',
    principalName: 'Dr. Asha Deshmukh',
    academicYear: '2025-26',
    timezone: 'Asia/Kolkata',
  });

  greenwoodId = greenwood._id.toString();

  const admin = await userModel.create({
    tenantId: greenwood._id,
    email: 'principal@greenwood.test',
    name: 'Greenwood Principal',
    role: 'school_admin',
    passwordHash: pendingHash,
    status: 'active',
  });

  await userModel.create({
    tenantId: greenwood._id,
    email: 'teacher@greenwood.test',
    name: 'Greenwood Teacher',
    role: 'teacher',
    passwordHash,
    status: 'active',
    passwordChangedAt: new Date(),
  });

  await userModel.create({
    tenantId: greenwood._id,
    email: 'suspended@greenwood.test',
    name: 'Suspended Teacher',
    role: 'teacher',
    passwordHash,
    status: 'suspended',
    passwordChangedAt: new Date(),
  });

  await userModel.create({
    tenantId: greenwood._id,
    email: 'locked@greenwood.test',
    name: 'Locked Staff',
    role: 'staff',
    passwordHash,
    status: 'active',
    passwordChangedAt: new Date(),
    lockedUntil: new Date(Date.now() + 10 * 60_000),
  });

  await resetTokenModel.create({
    tokenHash: 'seeded-pending-invite-hash',
    subjectId: admin._id,
    subjectType: 'app',
    email: admin.email ?? '',
    expiresAt: new Date(Date.now() + 72 * 60 * 60_000),
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

  await login('teacher@greenwood.test', PASSWORD).expect(200);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

describe('Admin school detail (e2e)', () => {
  beforeEach(() => {
    sendPasswordInvite.mockClear();
  });

  describe('detail', () => {
    it('returns the full configuration, live stats and recent users', async () => {
      const token = await adminToken(SUPER_EMAIL);
      const response = await detail(token, greenwoodId).expect(200);
      const body = response.body as {
        school: Record<string, unknown>;
        stats: Record<string, unknown>;
        recentUsers: {
          email: string;
          setupPending: boolean;
          lastLoginAt: string | null;
        }[];
      };

      expect(body.school).toMatchObject({
        id: greenwoodId,
        name: 'Greenwood High',
        slug: GREENWOOD_SLUG,
        type: 'school',
        plan: 'growth',
        status: 'active',
        phone: '+91 98765 43210',
        email: 'office@greenwood.test',
        website: 'https://greenwood.test',
        addressLine1: '12 Vidya Marg',
        addressLine2: 'Civil Lines',
        city: 'Nagpur',
        state: 'Maharashtra',
        pincode: '440001',
        country: 'India',
        tagline: 'Excellence in every classroom.',
        brandColor: '#047857',
        logo: '',
        board: 'cbse',
        affiliationNumber: 'CBSE/3300123',
        principalName: 'Dr. Asha Deshmukh',
        academicYear: '2025-26',
        timezone: 'Asia/Kolkata',
      });

      expect(body.stats).toEqual({
        totalUsers: 4,
        activeUsers: 3,
        suspendedUsers: 1,
        lockedUsers: 1,
        pendingSetupUsers: 1,
        activeSessions: 1,
        pendingInvites: 1,
        schoolAdmins: 1,
        teachers: 2,
        staff: 1,
        students: 0,
        lastLoginAt: expect.any(String) as string,
      });

      expect(body.recentUsers[0]).toMatchObject({
        email: 'teacher@greenwood.test',
        setupPending: false,
        lastLoginAt: expect.any(String) as string,
      });

      const admin = body.recentUsers.find(
        (user) => user.email === 'principal@greenwood.test',
      );

      expect(admin?.setupPending).toBe(true);
      expect(admin?.lastLoginAt).toBeNull();
    });

    it('keeps logos out of the list payload and includes the brand colour', async () => {
      const token = await adminToken(SUPER_EMAIL);
      const response = await request(app.getHttpServer())
        .get('/api/admin/schools')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const rows = response.body as Record<string, unknown>[];
      const greenwood = rows.find((row) => row['slug'] === GREENWOOD_SLUG);

      expect(greenwood).toMatchObject({
        brandColor: '#047857',
        userCount: 4,
      });
      expect(greenwood && 'logo' in greenwood).toBe(false);
    });

    it('returns 404 for invalid and unknown ids', async () => {
      const token = await adminToken(SUPER_EMAIL);

      await detail(token, 'not-an-id').expect(404);
      await detail(token, new Types.ObjectId().toString()).expect(404);
    });
  });

  describe('access control', () => {
    it('requires a super admin token for the new endpoints', async () => {
      await request(app.getHttpServer())
        .get(`/api/admin/schools/${greenwoodId}`)
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/admin/schools/${greenwoodId}`)
        .send({ tagline: 'x' })
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/admin/schools/${greenwoodId}/resend-invite`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/admin/schools/${greenwoodId}/reset-password`)
        .expect(401);
    });

    it('forbids support admins from detail, update and resend actions', async () => {
      const token = await adminToken(SUPPORT_EMAIL);

      await detail(token, greenwoodId).expect(403);
      await patchSchool(token, greenwoodId, { tagline: 'x' }).expect(403);
      await resendInvite(token, greenwoodId).expect(403);
      await resetPassword(token, greenwoodId).expect(403);
    });

    it('rejects school-scope tokens', async () => {
      const response = await login('teacher@greenwood.test', PASSWORD).expect(
        200,
      );

      await request(app.getHttpServer())
        .get(`/api/admin/schools/${greenwoodId}`)
        .set('Authorization', `Bearer ${response.body.accessToken as string}`)
        .expect(401);
    });
  });

  describe('update', () => {
    it('updates the full configuration and clears optional fields', async () => {
      const token = await adminToken(SUPER_EMAIL);
      const created = await createSchool(token).expect(201);
      const id = created.body.school.id as string;

      const updated = await patchSchool(token, id, {
        phone: '+91 90000 11111',
        email: 'office@riverside.test',
        website: 'https://riverside.test',
        addressLine1: '5 Riverside Road',
        addressLine2: 'Panchavati',
        state: 'Maharashtra',
        pincode: '422003',
        country: 'India',
        tagline: 'Learn. Lead. Inspire.',
        brandColor: '#1d4ed8',
        board: 'icse',
        affiliationNumber: 'ICSE/MH-042',
        principalName: 'Mrs. R. Iyer',
        academicYear: '2026-27',
        timezone: 'Asia/Kolkata',
      }).expect(200);

      expect(updated.body.brandColor).toBe('#1d4ed8');

      const detailResponse = await detail(token, id).expect(200);

      expect(detailResponse.body.school).toMatchObject({
        phone: '+91 90000 11111',
        email: 'office@riverside.test',
        website: 'https://riverside.test',
        addressLine1: '5 Riverside Road',
        addressLine2: 'Panchavati',
        state: 'Maharashtra',
        pincode: '422003',
        country: 'India',
        tagline: 'Learn. Lead. Inspire.',
        brandColor: '#1d4ed8',
        board: 'icse',
        affiliationNumber: 'ICSE/MH-042',
        principalName: 'Mrs. R. Iyer',
        academicYear: '2026-27',
        timezone: 'Asia/Kolkata',
      });

      await patchSchool(token, id, {
        phone: '',
        tagline: '',
        pincode: '',
      }).expect(200);

      const cleared = await detail(token, id).expect(200);

      expect(cleared.body.school).toMatchObject({
        phone: '',
        tagline: '',
        pincode: '',
      });
    });

    it('rejects invalid configuration values', async () => {
      const token = await adminToken(SUPER_EMAIL);
      const created = await createSchool(token, {
        name: 'Hillcrest Academy',
        adminEmail: 'hillcrest@demo.test',
      }).expect(201);
      const id = created.body.school.id as string;

      await patchSchool(token, id, { name: 'X' }).expect(400);
      await patchSchool(token, id, { brandColor: 'red' }).expect(400);
      await patchSchool(token, id, { timezone: 'Mars/Phobos' }).expect(400);
      await patchSchool(token, id, { email: 'nope' }).expect(400);
      await patchSchool(token, id, { website: 'hillcrest' }).expect(400);
      await patchSchool(token, id, { pincode: 'abc' }).expect(400);
      await patchSchool(token, id, { phone: 'abc' }).expect(400);
      await patchSchool(token, id, { academicYear: '20-26' }).expect(400);
      await patchSchool(token, id, { board: 'kerala' }).expect(400);
      await patchSchool(token, id, {
        logo: 'data:text/html;base64,AAAA',
      }).expect(400);
      await patchSchool(token, id, {
        logo: `data:image/png;base64,${'A'.repeat(2_900_000)}`,
      }).expect(400);
    });

    it('guards login domain changes against conflicts and reserved names', async () => {
      const token = await adminToken(SUPER_EMAIL);
      const created = await createSchool(token, {
        name: 'Lakeview High',
        adminEmail: 'lakeview@demo.test',
      }).expect(201);
      const id = created.body.school.id as string;

      const reserved = await patchSchool(token, id, {
        slug: 'admin',
      }).expect(409);

      expect(reserved.body.message).toContain('reserved');

      const clash = await patchSchool(token, id, {
        slug: 'riverside-public-school',
      }).expect(409);

      expect(clash.body.message).toContain('already uses');

      await patchSchool(token, id, { slug: 'AB' }).expect(400);

      const renamed = await patchSchool(token, id, {
        slug: 'lakeview-international',
      }).expect(200);

      expect(renamed.body.slug).toBe('lakeview-international');
    });

    it('stores and clears a logo data url', async () => {
      const token = await adminToken(SUPER_EMAIL);
      const created = await createSchool(token, {
        name: 'Orchid International',
        adminEmail: 'orchid@demo.test',
      }).expect(201);
      const id = created.body.school.id as string;

      await patchSchool(token, id, { logo: PNG_DATA_URL }).expect(200);

      const withLogo = await detail(token, id).expect(200);

      expect(withLogo.body.school.logo).toBe(PNG_DATA_URL);

      const list = await request(app.getHttpServer())
        .get('/api/admin/schools')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const row = (list.body as Record<string, unknown>[]).find(
        (entry) => entry['id'] === id,
      );

      expect(row && 'logo' in row).toBe(false);

      await patchSchool(token, id, { logo: '' }).expect(200);

      const cleared = await detail(token, id).expect(200);

      expect(cleared.body.school.logo).toBe('');
    });

    it('returns 404 for unknown schools', async () => {
      const token = await adminToken(SUPER_EMAIL);

      await patchSchool(token, 'not-an-id', { tagline: 'x' }).expect(404);
      await patchSchool(token, new Types.ObjectId().toString(), {
        tagline: 'x',
      }).expect(404);
    });
  });

  describe('resend invite', () => {
    it('resends setup links, invalidating the previous one, until setup completes', async () => {
      const token = await adminToken(SUPER_EMAIL);
      const created = await createSchool(token, {
        name: 'Sunfield School',
        adminEmail: 'sunfield@demo.test',
      }).expect(201);
      const id = created.body.school.id as string;

      const firstToken = tokenFrom(lastInviteUrl());

      const resent = await resendInvite(token, id).expect(200);

      expect(resent.body).toEqual({
        email: 'sunfield@demo.test',
        expiresInHours: 72,
        sent: true,
      });

      const secondToken = tokenFrom(lastInviteUrl());

      expect(secondToken).not.toBe(firstToken);

      await reset(firstToken, INVITE_PASSWORD).expect(400);
      await reset(secondToken, INVITE_PASSWORD).expect(204);
      await login('sunfield@demo.test', INVITE_PASSWORD).expect(200);

      const afterSetup = await resendInvite(token, id).expect(400);

      expect(afterSetup.body.message).toContain('pending');

      const detailResponse = await detail(token, id).expect(200);

      expect(detailResponse.body.stats).toMatchObject({
        pendingSetupUsers: 0,
        pendingInvites: 0,
      });
    });

    it('returns 404 for unknown schools', async () => {
      const token = await adminToken(SUPER_EMAIL);

      await resendInvite(token, 'not-an-id').expect(404);
    });
  });

  describe('reset password', () => {
    it('emails a reset link to the school admin and rotates previous links', async () => {
      const token = await adminToken(SUPER_EMAIL);
      const created = await createSchool(token, {
        name: 'Rosewood Academy',
        adminEmail: 'rosewood@demo.test',
      }).expect(201);
      const id = created.body.school.id as string;

      await reset(tokenFrom(lastInviteUrl()), INVITE_PASSWORD).expect(204);
      await login('rosewood@demo.test', INVITE_PASSWORD).expect(200);

      const response = await resetPassword(token, id).expect(200);

      expect(response.body).toEqual({
        kind: 'reset',
        email: 'rosewood@demo.test',
        sent: true,
        expiresInMinutes: 30,
      });

      const firstUrl = lastResetUrl();
      const firstToken = tokenFrom(firstUrl);

      expect(firstUrl).toContain('http://localhost:4200/reset-password?token=');

      const rotated = await resetPassword(token, id).expect(200);

      expect(rotated.body.kind).toBe('reset');

      const secondToken = tokenFrom(lastResetUrl());

      expect(secondToken).not.toBe(firstToken);

      await reset(firstToken, 'Rosewood@12345').expect(400);
      await reset(secondToken, 'Rosewood@12345').expect(204);
      await login('rosewood@demo.test', 'Rosewood@12345').expect(200);
      await login('rosewood@demo.test', INVITE_PASSWORD).expect(401);
    });

    it('sends the setup link when the admin has not chosen a password yet', async () => {
      const token = await adminToken(SUPER_EMAIL);
      const created = await createSchool(token, {
        name: 'Fernwood School',
        adminEmail: 'fernwood@demo.test',
      }).expect(201);
      const id = created.body.school.id as string;

      const response = await resetPassword(token, id).expect(200);

      expect(response.body).toEqual({
        kind: 'invite',
        email: 'fernwood@demo.test',
        sent: true,
        expiresInHours: 72,
      });
    });

    it('returns 400 when no active admin exists and 404 for unknown schools', async () => {
      const token = await adminToken(SUPER_EMAIL);
      const created = await createSchool(token, {
        name: 'Birchwood School',
        adminEmail: 'birchwood@demo.test',
      }).expect(201);
      const id = created.body.school.id as string;
      const userModel = app.get<Model<User>>(getModelToken(User.name));

      await userModel
        .updateOne(
          { email: 'birchwood@demo.test' },
          { $set: { status: 'suspended' } },
        )
        .exec();

      const response = await resetPassword(token, id).expect(400);

      expect(response.body.message).toContain('No active school admin');

      await resetPassword(token, new Types.ObjectId().toString()).expect(404);
    });
  });
});
