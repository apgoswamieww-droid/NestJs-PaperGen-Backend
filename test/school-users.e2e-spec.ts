import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import { RolePermissionsService } from '../src/auth/role-permissions.service.js';
import {
  MailService,
  type CredentialsDetails,
} from '../src/mail/mail.service.js';
import { Role } from '../src/schemas/role.schema.js';
import { Tenant } from '../src/schemas/tenant.schema.js';
import { User, type UserDocument } from '../src/schemas/user.schema.js';

const PASSWORD = 'School@12345';
const PRINCIPAL_EMAIL = 'principal@greenwood.test';
const VICE_EMAIL = 'vice@greenwood.test';
const TEACHER_EMAIL = 'teacher@greenwood.test';
const STAFF_EMAIL = 'staff@greenwood.test';
const STUDENT_EMAIL = 'student@greenwood.test';
const RIVERTON_PRINCIPAL_EMAIL = 'principal@riverton.test';
const RIVERTON_VICE_EMAIL = 'vice@riverton.test';

let app: INestApplication;
let mongo: MongoMemoryServer;
let sendCredentials: ReturnType<typeof vi.fn>;
let userModel: Model<User>;
let roleModel: Model<Role>;
let rolePermissions: RolePermissionsService;

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

async function appToken(email: string, password: string): Promise<string> {
  const response = await login(email, password).expect(200);

  return response.body.accessToken as string;
}

function listUsers(token: string, query: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .get('/api/users')
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

function createUser(token: string, payload: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post('/api/users')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function patchUser(
  token: string,
  id: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .patch(`/api/users/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function setUserStatus(token: string, id: string, status: string) {
  return request(app.getHttpServer())
    .patch(`/api/users/${id}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status });
}

function resetUserPassword(token: string, id: string) {
  return request(app.getHttpServer())
    .post(`/api/users/${id}/reset-password`)
    .set('Authorization', `Bearer ${token}`);
}

function deleteUser(token: string, id: string) {
  return request(app.getHttpServer())
    .delete(`/api/users/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

function userDetail(token: string, id: string) {
  return request(app.getHttpServer())
    .get(`/api/users/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

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

function lastCredentials(): CredentialsDetails {
  const calls = sendCredentials.mock.calls;

  if (calls.length === 0) {
    throw new Error('No credentials email was sent.');
  }

  return calls[calls.length - 1][0] as CredentialsDetails;
}

async function findUser(email: string): Promise<UserDocument> {
  const user = await userModel.findOne({ email }).exec();

  if (!user) {
    throw new Error(`Seeded user ${email} was not found.`);
  }

  return user;
}

async function createViaApi(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; password: string; email: string }> {
  const email = `fixture-${new Types.ObjectId().toString()}@greenwood.test`;
  const response = await createUser(token, {
    name: 'Fixture User',
    email,
    role: 'teacher',
    ...overrides,
  }).expect(201);

  return {
    id: response.body.user.id as string,
    password: response.body.credentials.password as string,
    email,
  };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-school-users-test');
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

  sendCredentials = vi.fn().mockResolvedValue(undefined);

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MailService)
    .useValue({
      sendCredentials,
      sendPasswordReset: vi.fn().mockResolvedValue(undefined),
      sendPasswordInvite: vi.fn().mockResolvedValue(undefined),
    })
    .compile();

  app = configureApp(moduleFixture.createNestApplication());
  await app.init();

  const passwordService = app.get(PasswordService);
  const tenantModel = app.get<Model<Tenant>>(getModelToken(Tenant.name));

  userModel = app.get<Model<User>>(getModelToken(User.name));
  roleModel = app.get<Model<Role>>(getModelToken(Role.name));
  rolePermissions = app.get(RolePermissionsService);

  const passwordHash = await passwordService.hash(PASSWORD);

  const greenwood = await tenantModel.create({
    name: 'Greenwood High',
    slug: 'greenwood-users',
    type: 'school',
    plan: 'growth',
    status: 'active',
  });
  const riverton = await tenantModel.create({
    name: 'Riverton School',
    slug: 'riverton-users',
    type: 'school',
    plan: 'starter',
    status: 'active',
  });

  await userModel.create([
    {
      tenantId: greenwood._id,
      name: 'Asha Deshmukh',
      email: PRINCIPAL_EMAIL,
      role: 'school_admin',
      passwordHash,
      status: 'active',
      passwordChangedAt: new Date(),
    },
    {
      tenantId: greenwood._id,
      name: 'Bharat Patil',
      email: VICE_EMAIL,
      role: 'school_admin',
      passwordHash,
      status: 'active',
      passwordChangedAt: new Date(),
    },
    {
      tenantId: greenwood._id,
      name: 'Chetan Joshi',
      email: TEACHER_EMAIL,
      role: 'teacher',
      passwordHash,
      status: 'active',
      passwordChangedAt: new Date(),
    },
    {
      tenantId: greenwood._id,
      name: 'Deepa Rao',
      email: STAFF_EMAIL,
      role: 'staff',
      passwordHash,
      status: 'suspended',
      passwordChangedAt: new Date(),
    },
    {
      tenantId: greenwood._id,
      name: 'Esha Kulkarni',
      email: STUDENT_EMAIL,
      phone: '+91 91234 56780',
      role: 'student',
      passwordHash,
      status: 'active',
      passwordChangedAt: new Date(),
    },
    {
      tenantId: riverton._id,
      name: 'Vikram Rathod',
      email: RIVERTON_PRINCIPAL_EMAIL,
      role: 'school_admin',
      passwordHash,
      status: 'active',
      passwordChangedAt: new Date(),
    },
    {
      tenantId: riverton._id,
      name: 'Waman Kale',
      email: RIVERTON_VICE_EMAIL,
      role: 'school_admin',
      passwordHash,
      status: 'active',
      passwordChangedAt: new Date(),
    },
    {
      tenantId: riverton._id,
      name: 'Yash Shinde',
      email: 'teacher@riverton.test',
      role: 'teacher',
      passwordHash,
      status: 'active',
      passwordChangedAt: new Date(),
    },
  ]);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

describe('School users (e2e)', () => {
  describe('access control', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer()).get('/api/users').expect(401);
      await request(app.getHttpServer())
        .post('/api/users')
        .send({ name: 'No Token', email: 'notoken@test.test', role: 'teacher' })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/users/${new Types.ObjectId().toString()}`)
        .send({ name: 'No Token' })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/users/${new Types.ObjectId().toString()}/status`)
        .send({ status: 'suspended' })
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/users/${new Types.ObjectId().toString()}/reset-password`)
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/users/${new Types.ObjectId().toString()}`)
        .expect(401);
    });

    it('forbids teachers and students from managing users', async () => {
      const teacherToken = await appToken(TEACHER_EMAIL, PASSWORD);
      const studentToken = await appToken(STUDENT_EMAIL, PASSWORD);

      await listUsers(teacherToken).expect(403);
      await createUser(teacherToken, {
        name: 'Teacher Created',
        email: 'teacher.created@greenwood.test',
        role: 'student',
      }).expect(403);
      await listUsers(studentToken).expect(403);
    });
  });

  describe('list', () => {
    it('returns the tenant directory with live summary counts', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await listUsers(token).expect(200);

      expect(response.body.total).toBe(5);
      expect(response.body.page).toBe(1);
      expect(response.body.pageSize).toBe(10);
      expect(response.body.summary).toEqual({
        totalUsers: 5,
        activeUsers: 4,
        suspendedUsers: 1,
        schoolAdmins: 2,
        teachers: 1,
        staff: 1,
        students: 1,
      });

      const emails = (response.body.items as { email: string }[]).map(
        (item) => item.email,
      );

      expect(emails).toContain(STUDENT_EMAIL);
      expect(emails).toContain(STAFF_EMAIL);

      const student = (response.body.items as Record<string, unknown>[]).find(
        (item) => item['email'] === STUDENT_EMAIL,
      );

      expect(student).toMatchObject({
        name: 'Esha Kulkarni',
        phone: '+91 91234 56780',
        role: 'student',
        status: 'active',
      });
      expect(student && typeof student['createdAt']).toBe('string');
    });

    it('searches, filters, sorts and paginates', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const byName = await listUsers(token, {
        search: 'CHETAN',
        sort: 'name',
        dir: 'asc',
      }).expect(200);

      expect(byName.body.total).toBe(1);
      expect(byName.body.items[0].email).toBe(TEACHER_EMAIL);

      const byEmail = await listUsers(token, {
        search: 'greenwood.test',
      }).expect(200);

      expect(byEmail.body.total).toBe(5);

      const escaped = await listUsers(token, { search: 'che*' }).expect(200);

      expect(escaped.body.total).toBe(0);

      const filtered = await listUsers(token, {
        role: 'teacher',
        status: 'active',
      }).expect(200);

      expect(filtered.body.total).toBe(1);
      expect(filtered.body.items[0].email).toBe(TEACHER_EMAIL);

      const suspended = await listUsers(token, {
        status: 'suspended',
      }).expect(200);

      expect(suspended.body.total).toBe(1);
      expect(suspended.body.items[0].email).toBe(STAFF_EMAIL);

      const sorted = await listUsers(token, {
        sort: 'name',
        dir: 'asc',
      }).expect(200);

      expect(
        (sorted.body.items as { name: string }[]).map((item) => item.name),
      ).toEqual([
        'Asha Deshmukh',
        'Bharat Patil',
        'Chetan Joshi',
        'Deepa Rao',
        'Esha Kulkarni',
      ]);

      const blankStatus = await listUsers(token, { status: '' }).expect(200);

      expect(blankStatus.body.total).toBe(5);

      for (let index = 0; index < 7; index += 1) {
        await createViaApi(token, { name: `Paging Fixture ${index}` });
      }

      const page = await listUsers(token, {
        sort: 'name',
        dir: 'asc',
        pageSize: 10,
        page: 2,
      }).expect(200);

      expect(page.body.page).toBe(2);
      expect(page.body.total).toBe(12);
      expect((page.body.items as unknown[]).length).toBe(2);
    });

    it('rejects invalid list queries', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await listUsers(token, { role: 'principal' }).expect(400);
      await listUsers(token, { status: 'archived' }).expect(400);
      await listUsers(token, { sort: 'email' }).expect(400);
      await listUsers(token, { dir: 'sideways' }).expect(400);
      await listUsers(token, { pageSize: 15 }).expect(400);
      await listUsers(token, { page: 0 }).expect(400);
      await listUsers(token, { page: 'abc' }).expect(400);
    });

    it('keeps tenants isolated', async () => {
      const rivertonToken = await appToken(RIVERTON_PRINCIPAL_EMAIL, PASSWORD);
      const response = await listUsers(rivertonToken).expect(200);

      expect(response.body.total).toBe(3);
      expect(response.body.summary).toEqual({
        totalUsers: 3,
        activeUsers: 3,
        suspendedUsers: 0,
        schoolAdmins: 2,
        teachers: 1,
        staff: 0,
        students: 0,
      });
      expect(
        (response.body.items as { email: string }[]).every((item) =>
          item.email.endsWith('@riverton.test'),
        ),
      ).toBe(true);

      const greenwoodToken = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const student = await findUser(STUDENT_EMAIL);

      await userDetail(rivertonToken, student._id.toString()).expect(404);

      const rivertonTeacher = await findUser('teacher@riverton.test');

      await userDetail(greenwoodToken, rivertonTeacher._id.toString()).expect(
        404,
      );
    });
  });

  describe('create', () => {
    it('creates a user, emails generated credentials and allows login', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await createUser(token, {
        name: 'New Student',
        email: 'New.Student@greenwood.test',
        phone: '+91 90000 11111',
        role: 'student',
      }).expect(201);

      expect(response.body.user).toMatchObject({
        name: 'New Student',
        email: 'new.student@greenwood.test',
        phone: '+91 90000 11111',
        role: 'student',
        status: 'active',
        lastLoginAt: null,
      });

      const password = response.body.credentials.password as string;

      expect(response.body.credentials).toMatchObject({
        email: 'new.student@greenwood.test',
        sent: true,
      });
      expect(password).toHaveLength(14);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^A-Za-z0-9]/);

      expect(lastCredentials()).toEqual({
        to: 'new.student@greenwood.test',
        name: 'New Student',
        tenantName: 'Greenwood High',
        email: 'new.student@greenwood.test',
        password,
        url: 'http://localhost:4200/login',
      });

      await login('new.student@greenwood.test', password).expect(200);

      const created = await findUser('new.student@greenwood.test');

      expect(created.lastLoginAt).toBeInstanceOf(Date);
    });

    it('stores an empty phone when omitted and rejects duplicates', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const created = await createUser(token, {
        name: 'No Phone Staff',
        email: 'nophone@greenwood.test',
        role: 'staff',
      }).expect(201);

      expect(created.body.user.phone).toBe('');

      const duplicate = await createUser(token, {
        name: 'Copy Cat',
        email: 'nophone@greenwood.test',
        role: 'staff',
      }).expect(409);

      expect(duplicate.body.message).toContain('already exists');
    });

    it('rejects invalid payloads', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await createUser(token, {
        name: 'Bad Role',
        email: 'badrole@greenwood.test',
        role: 'principal',
      }).expect(400);
      await createUser(token, {
        name: 'Bad Role',
        email: 'badrole@greenwood.test',
      }).expect(400);
      await createUser(token, {
        name: 'X',
        email: 'short@greenwood.test',
        role: 'teacher',
      }).expect(400);
      await createUser(token, {
        name: 'Bad Email',
        email: 'not-an-email',
        role: 'teacher',
      }).expect(400);
      await createUser(token, {
        name: 'Bad Phone',
        email: 'badphone@greenwood.test',
        phone: 'call me',
        role: 'teacher',
      }).expect(400);
    });
  });

  describe('update', () => {
    it('updates profile fields and role', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token, { name: 'Temp Teacher' });

      const updated = await patchUser(token, fixture.id, {
        name: 'Updated Teacher',
        email: 'updated.teacher@greenwood.test',
        phone: '+91 98765 00001',
        role: 'staff',
      }).expect(200);

      expect(updated.body).toMatchObject({
        id: fixture.id,
        name: 'Updated Teacher',
        email: 'updated.teacher@greenwood.test',
        phone: '+91 98765 00001',
        role: 'staff',
        status: 'active',
      });

      const detail = await userDetail(token, fixture.id).expect(200);

      expect(detail.body.name).toBe('Updated Teacher');
    });

    it('protects self role changes and duplicate emails', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const me = await findUser(PRINCIPAL_EMAIL);

      const ownRole = await patchUser(token, me._id.toString(), {
        role: 'teacher',
      }).expect(400);

      expect(ownRole.body.message).toContain('your own role');

      const fixture = await createViaApi(token);

      const duplicate = await patchUser(token, fixture.id, {
        email: PRINCIPAL_EMAIL,
      }).expect(409);

      expect(duplicate.body.message).toContain('already exists');
    });

    it('rejects invalid payloads and unknown users', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await patchUser(token, fixture.id, { name: 'X' }).expect(400);
      await patchUser(token, fixture.id, { role: 'owner' }).expect(400);
      await patchUser(token, fixture.id, { email: 'nope' }).expect(400);
      await patchUser(token, fixture.id, { phone: 'call me' }).expect(400);
      await patchUser(token, 'not-an-id', { name: 'Ghost' }).expect(404);
      await patchUser(token, new Types.ObjectId().toString(), {
        name: 'Ghost',
      }).expect(404);
    });
  });

  describe('status', () => {
    it('suspends and activates users, revoking sessions on suspension', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);
      const loginResponse = await login(fixture.email, fixture.password).expect(
        200,
      );
      const cookie = refreshCookie(loginResponse, 'pg_rt');

      expect(cookie).toBeTruthy();

      const suspended = await setUserStatus(
        token,
        fixture.id,
        'suspended',
      ).expect(200);

      expect(suspended.body.status).toBe('suspended');

      await login(fixture.email, fixture.password).expect(403);

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie ?? '')
        .expect(401);

      const activated = await setUserStatus(token, fixture.id, 'active').expect(
        200,
      );

      expect(activated.body.status).toBe('active');
      await login(fixture.email, fixture.password).expect(200);
    });

    it('prevents suspending your own account', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const me = await findUser(PRINCIPAL_EMAIL);

      const response = await setUserStatus(
        token,
        me._id.toString(),
        'suspended',
      ).expect(400);

      expect(response.body.message).toContain('your own account');
    });

    it('rejects invalid status values and unknown users', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await setUserStatus(token, fixture.id, 'archived').expect(400);
      await setUserStatus(
        token,
        new Types.ObjectId().toString(),
        'active',
      ).expect(404);
      await setUserStatus(token, 'not-an-id', 'active').expect(404);
    });

    it('refuses to strip a tenant of its last active admin', async () => {
      const vice = await findUser(RIVERTON_VICE_EMAIL);
      const principal = await findUser(RIVERTON_PRINCIPAL_EMAIL);

      await roleModel.create({
        tenantId: principal.tenantId,
        key: 'user_manager',
        name: 'User manager',
        nameKey: 'user manager',
        description: 'Manages school users.',
        permissions: ['users.view', 'users.manage'],
        isSystem: false,
      });
      rolePermissions.invalidateTenant(principal.tenantId.toString());

      const principalToken = await appToken(RIVERTON_PRINCIPAL_EMAIL, PASSWORD);
      const manager = await createViaApi(principalToken, {
        name: 'Riverton User Manager',
        role: 'user_manager',
      });
      const managerToken = await appToken(manager.email, manager.password);

      await userModel
        .updateOne({ _id: vice._id }, { $set: { status: 'suspended' } })
        .exec();
      rolePermissions.invalidateUser(vice._id.toString());

      const status = await setUserStatus(
        managerToken,
        principal._id.toString(),
        'suspended',
      ).expect(400);

      expect(status.body.message).toContain('At least one active school');

      await patchUser(managerToken, principal._id.toString(), {
        role: 'staff',
      }).expect(400);
      await deleteUser(managerToken, principal._id.toString()).expect(400);

      await userModel
        .updateOne({ _id: vice._id }, { $set: { status: 'active' } })
        .exec();
      await userModel.deleteOne({ _id: manager.id }).exec();
      await roleModel
        .deleteOne({ tenantId: principal.tenantId, key: 'user_manager' })
        .exec();
      rolePermissions.invalidateUser(vice._id.toString());
      rolePermissions.invalidateUser(manager.id);
      rolePermissions.invalidateTenant(principal.tenantId.toString());
    });
  });

  describe('reset password', () => {
    it('rotates the password, emails it and invalidates the old one', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const response = await resetUserPassword(token, fixture.id).expect(200);

      expect(response.body.email).toBe(fixture.email);
      expect(response.body.sent).toBe(true);

      const newPassword = response.body.password as string;

      expect(newPassword).toHaveLength(14);
      expect(newPassword).not.toBe(fixture.password);
      expect(lastCredentials().to).toBe(fixture.email);
      expect(lastCredentials().password).toBe(newPassword);

      await login(fixture.email, fixture.password).expect(401);
      await login(fixture.email, newPassword).expect(200);
    });

    it('returns 404 for unknown users', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await resetUserPassword(token, 'not-an-id').expect(404);
      await resetUserPassword(token, new Types.ObjectId().toString()).expect(
        404,
      );
    });
  });

  describe('delete', () => {
    it('removes the user and its sessions ending access', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await login(fixture.email, fixture.password).expect(200);
      await deleteUser(token, fixture.id).expect(204);
      await login(fixture.email, fixture.password).expect(401);
      await userDetail(token, fixture.id).expect(404);

      const search = await listUsers(token, {
        search: fixture.email,
      }).expect(200);

      expect(search.body.total).toBe(0);
      await deleteUser(token, fixture.id).expect(404);
    });

    it('prevents deleting your own account', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const me = await findUser(PRINCIPAL_EMAIL);

      const response = await deleteUser(token, me._id.toString()).expect(400);

      expect(response.body.message).toContain('your own account');
    });

    it('returns 404 for unknown users', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await deleteUser(token, 'not-an-id').expect(404);
      await deleteUser(token, new Types.ObjectId().toString()).expect(404);
    });
  });
});
