import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import { RolePermissionsService } from '../src/auth/role-permissions.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { Tenant } from '../src/schemas/tenant.schema.js';
import { User } from '../src/schemas/user.schema.js';

const PASSWORD = 'School@12345';
const PRINCIPAL_EMAIL = 'principal@greenwood.test';
const TEACHER_EMAIL = 'teacher@greenwood.test';
const STAFF_EMAIL = 'staff@greenwood.test';
const RIVERTON_PRINCIPAL_EMAIL = 'principal@riverton.test';

let app: INestApplication;
let mongo: MongoMemoryServer;
let sendCredentials: ReturnType<typeof vi.fn>;
let userModel: Model<User>;
let teacherId: string;
let staffId: string;

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

async function appToken(email: string, password: string): Promise<string> {
  const response = await login(email, password).expect(200);

  return response.body.accessToken as string;
}

function listRoles(token: string, query: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .get('/api/roles')
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

function roleOptions(token: string) {
  return request(app.getHttpServer())
    .get('/api/roles/options')
    .set('Authorization', `Bearer ${token}`);
}

function listAudit(token: string, query: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .get('/api/roles/audit')
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

function createRole(token: string, payload: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post('/api/roles')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function updateRole(
  token: string,
  key: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .patch(`/api/roles/${key}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function deleteRole(token: string, key: string) {
  return request(app.getHttpServer())
    .delete(`/api/roles/${key}`)
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

function listMediums(token: string) {
  return request(app.getHttpServer())
    .get('/api/mediums')
    .set('Authorization', `Bearer ${token}`);
}

function createMedium(token: string, name: string) {
  return request(app.getHttpServer())
    .post('/api/mediums')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });
}

async function createUserWithRole(
  token: string,
  role: string,
  label: string,
): Promise<{ id: string; email: string; password: string }> {
  const email = `${label}-${new Types.ObjectId().toString()}@greenwood.test`;
  const response = await createUser(token, {
    name: `${label} fixture`,
    email,
    role,
  }).expect(201);

  return {
    id: response.body.user.id as string,
    email,
    password: response.body.credentials.password as string,
  };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-school-roles-test');
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
  const rolePermissions = app.get(RolePermissionsService);

  userModel = app.get<Model<User>>(getModelToken(User.name));

  const passwordHash = await passwordService.hash(PASSWORD);
  const greenwood = await tenantModel.create({
    name: 'Greenwood High',
    slug: 'greenwood-roles',
    type: 'school',
    plan: 'growth',
    status: 'active',
  });
  const riverton = await tenantModel.create({
    name: 'Riverton School',
    slug: 'riverton-roles',
    type: 'school',
    plan: 'starter',
    status: 'active',
  });

  const [, teacher, staff] = await userModel.create([
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
  ]);

  teacherId = teacher._id.toString();
  staffId = staff._id.toString();

  await rolePermissions.ensureSystemRoles(greenwood._id);
  await rolePermissions.ensureSystemRoles(riverton._id);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

describe('School roles (e2e)', () => {
  describe('access control', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer()).get('/api/roles').expect(401);
      await request(app.getHttpServer()).get('/api/roles/options').expect(401);
      await request(app.getHttpServer()).get('/api/roles/audit').expect(401);
      await request(app.getHttpServer())
        .post('/api/roles')
        .send({ name: 'Nope' })
        .expect(401);
    });

    it('applies view and manage permissions independently', async () => {
      const teacherToken = await appToken(TEACHER_EMAIL, PASSWORD);
      const staffToken = await appToken(STAFF_EMAIL, PASSWORD);

      await listRoles(teacherToken).expect(403);
      await listAudit(teacherToken).expect(403);
      await roleOptions(teacherToken).expect(403);
      await createRole(teacherToken, { name: 'Teacher Role' }).expect(403);

      await roleOptions(staffToken).expect(200);
      await listRoles(staffToken).expect(403);
    });
  });

  describe('list and options', () => {
    it('returns system roles, summary counts and the permission catalog', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await listRoles(token).expect(200);

      expect(response.body.total).toBe(4);
      expect(response.body.summary).toEqual({
        total: 4,
        system: 4,
        custom: 0,
        assignedUsers: 3,
      });
      expect(response.body.catalog).toHaveLength(8);
      expect(
        (response.body.items as { key: string }[])
          .map((item) => item.key)
          .sort(),
      ).toEqual(['school_admin', 'staff', 'student', 'teacher']);

      const admin = (response.body.items as Record<string, unknown>[]).find(
        (item) => item['key'] === 'school_admin',
      );

      expect(admin).toMatchObject({
        name: 'School admin',
        isSystem: true,
        userCount: 1,
      });
      expect((admin?.['permissions'] as string[] | undefined)?.length).toBe(16);
    });

    it('searches, sorts and validates list queries', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const searched = await listRoles(token, {
        search: 'TEACH',
        sort: 'name',
        dir: 'asc',
      }).expect(200);

      expect(searched.body.total).toBe(1);
      expect(searched.body.items[0].key).toBe('teacher');

      await listRoles(token, { search: 'x'.repeat(101) }).expect(400);
      await listRoles(token, { pageSize: 15 }).expect(400);
      await listRoles(token, { sort: 'description' }).expect(400);
      await listRoles(token, { dir: 'sideways' }).expect(400);
    });

    it('offers role options to anyone who can view users', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await roleOptions(token).expect(200);

      expect(response.body).toHaveLength(4);
      expect(response.body[0]).toMatchObject({
        key: 'school_admin',
        isSystem: true,
      });
    });
  });

  describe('custom role lifecycle', () => {
    const ROLE_KEY = 'masters_editor';

    it('creates a custom role and normalises manage into view', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await createRole(token, {
        name: '  Masters Editor  ',
        description: 'Maintains the master data.',
        permissions: ['masters.manage', 'papers.view'],
      }).expect(201);

      expect(response.body).toMatchObject({
        key: ROLE_KEY,
        name: 'Masters Editor',
        description: 'Maintains the master data.',
        isSystem: false,
        userCount: 0,
      });
      expect(response.body.permissions).toEqual([
        'masters.view',
        'masters.manage',
        'papers.view',
      ]);

      await createRole(token, {
        name: 'masters editor',
        permissions: [],
      }).expect(409);

      await createRole(token, {
        name: 'Invalid Role',
        permissions: ['masters.destroy'],
      }).expect(400);
    });

    it('exposes the custom role in options and list counts', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const options = await roleOptions(token).expect(200);
      const list = await listRoles(token).expect(200);

      expect(
        (options.body as { key: string }[]).map((item) => item.key),
      ).toContain(ROLE_KEY);
      expect(list.body.summary).toMatchObject({
        total: 5,
        system: 4,
        custom: 1,
      });
    });

    it('lets a custom role enforce its permissions and reflect updates', async () => {
      const adminToken = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createUserWithRole(
        adminToken,
        ROLE_KEY,
        'masters-editor',
      );

      const loginResponse = await login(fixture.email, fixture.password).expect(
        200,
      );

      expect(loginResponse.body.user).toMatchObject({
        role: ROLE_KEY,
        permissions: ['masters.view', 'masters.manage', 'papers.view'],
      });

      const customToken = loginResponse.body.accessToken as string;

      await listMediums(customToken).expect(200);
      await createMedium(customToken, 'Custom Role Medium').expect(201);

      await updateRole(adminToken, ROLE_KEY, {
        name: 'Masters Lead',
        permissions: ['masters.view'],
      }).expect(200);

      await listMediums(customToken).expect(200);
      await createMedium(customToken, 'Blocked Medium').expect(403);

      const list = await listRoles(adminToken, {
        search: 'Masters Lead',
      }).expect(200);

      expect(list.body.items[0]).toMatchObject({
        key: ROLE_KEY,
        name: 'Masters Lead',
        permissions: ['masters.view'],
        userCount: 1,
      });

      await patchUser(adminToken, fixture.id, { role: 'teacher' }).expect(200);
      await deleteRole(adminToken, ROLE_KEY).expect(204);
    });

    it('protects system roles and assigned custom roles', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const custom = await createRole(token, {
        name: 'Assigned Custom',
        permissions: ['reports.view'],
      }).expect(201);
      const fixture = await createUserWithRole(
        token,
        custom.body.key as string,
        'assigned-custom',
      );

      await updateRole(token, 'teacher', { name: 'Faculty' }).expect(400);
      await updateRole(token, 'school_admin', {
        permissions: ['reports.view'],
      }).expect(400);
      await deleteRole(token, 'teacher').expect(400);
      await deleteRole(token, custom.body.key as string).expect(409);

      await patchUser(token, fixture.id, { role: 'staff' }).expect(200);
      await deleteRole(token, custom.body.key as string).expect(204);
    });

    it('only lets school admins assign the school admin role', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const managerRole = await createRole(token, {
        name: 'User Manager',
        permissions: ['users.view', 'users.manage'],
      }).expect(201);
      const fixture = await createUserWithRole(
        token,
        managerRole.body.key as string,
        'user-manager',
      );
      const loginResponse = await login(fixture.email, fixture.password).expect(
        200,
      );
      const managerToken = loginResponse.body.accessToken as string;

      await createUser(managerToken, {
        name: 'Shadow Admin',
        email: `shadow-${new Types.ObjectId().toString()}@greenwood.test`,
        role: 'school_admin',
      }).expect(400);

      await patchUser(managerToken, teacherId, { role: 'school_admin' }).expect(
        400,
      );
      await patchUser(managerToken, staffId, { role: 'teacher' }).expect(200);

      await patchUser(token, fixture.id, { role: 'teacher' }).expect(200);
      await deleteRole(token, managerRole.body.key as string).expect(204);
    });
  });

  describe('audit and isolation', () => {
    it('records role changes for the signed-in tenant only', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await listAudit(token, { pageSize: 50 }).expect(200);

      expect(response.body.total).toBeGreaterThanOrEqual(6);
      expect(
        (response.body.items as { action: string }[]).map(
          (item) => item.action,
        ),
      ).toEqual(expect.arrayContaining(['created', 'updated', 'deleted']));

      const entry = response.body.items[0] as Record<string, unknown>;

      expect(entry).toMatchObject({
        actorName: 'Asha Deshmukh',
        actorEmail: PRINCIPAL_EMAIL,
      });
      expect(typeof entry['createdAt']).toBe('string');

      const rivertonToken = await appToken(RIVERTON_PRINCIPAL_EMAIL, PASSWORD);
      const rivertonRoles = await listRoles(rivertonToken).expect(200);
      const rivertonAudit = await listAudit(rivertonToken).expect(200);

      expect(rivertonRoles.body.total).toBe(4);
      expect(rivertonAudit.body.total).toBe(0);
    });
  });
});
