import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import { MailService } from '../src/mail/mail.service.js';
import {
  ExamType,
  type ExamTypeDocument,
} from '../src/schemas/exam-type.schema.js';
import { Tenant } from '../src/schemas/tenant.schema.js';
import { User } from '../src/schemas/user.schema.js';

const PASSWORD = 'School@12345';
const PRINCIPAL_EMAIL = 'principal@greenwood.test';
const TEACHER_EMAIL = 'teacher@greenwood.test';
const RIVERTON_PRINCIPAL_EMAIL = 'principal@riverton.test';

let app: INestApplication;
let mongo: MongoMemoryServer;
let examTypeModel: Model<ExamType>;

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

async function appToken(email: string, password: string): Promise<string> {
  const response = await login(email, password).expect(200);

  return response.body.accessToken as string;
}

function listExamTypes(token: string, query: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .get('/api/exam-types')
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

function createExamType(token: string, payload: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post('/api/exam-types')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function patchExamType(
  token: string,
  id: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .patch(`/api/exam-types/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function deleteExamType(token: string, id: string) {
  return request(app.getHttpServer())
    .delete(`/api/exam-types/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

function restoreExamType(token: string, id: string) {
  return request(app.getHttpServer())
    .post(`/api/exam-types/${id}/restore`)
    .set('Authorization', `Bearer ${token}`);
}

async function findExamType(name: string): Promise<ExamTypeDocument> {
  const examType = await examTypeModel.findOne({ name }).exec();

  if (!examType) {
    throw new Error(`Seeded exam type ${name} was not found.`);
  }

  return examType;
}

async function createViaApi(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const name = `Fixture ${new Types.ObjectId().toString()}`;
  const response = await createExamType(token, {
    name,
    order: 90,
    ...overrides,
  }).expect(201);

  return { id: response.body.id as string, name: response.body.name as string };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-school-exam-types-test');
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
      sendCredentials: vi.fn().mockResolvedValue(undefined),
      sendPasswordReset: vi.fn().mockResolvedValue(undefined),
      sendPasswordInvite: vi.fn().mockResolvedValue(undefined),
    })
    .compile();

  app = configureApp(moduleFixture.createNestApplication());
  await app.init();

  const passwordService = app.get(PasswordService);
  const tenantModel = app.get<Model<Tenant>>(getModelToken(Tenant.name));

  examTypeModel = app.get<Model<ExamType>>(getModelToken(ExamType.name));

  const passwordHash = await passwordService.hash(PASSWORD);

  const greenwood = await tenantModel.create({
    name: 'Greenwood High',
    slug: 'greenwood-exam-types',
    type: 'school',
    plan: 'growth',
    status: 'active',
  });
  const riverton = await tenantModel.create({
    name: 'Riverton School',
    slug: 'riverton-exam-types',
    type: 'school',
    plan: 'starter',
    status: 'active',
  });

  await app.get<Model<User>>(getModelToken(User.name)).create([
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
      tenantId: riverton._id,
      name: 'Vikram Rathod',
      email: RIVERTON_PRINCIPAL_EMAIL,
      role: 'school_admin',
      passwordHash,
      status: 'active',
      passwordChangedAt: new Date(),
    },
  ]);

  await examTypeModel.create([
    {
      tenantId: greenwood._id,
      name: 'Unit Test',
      nameKey: 'unit test',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      name: 'Mid-Term Examination',
      nameKey: 'mid-term examination',
      order: 2,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      name: 'Final Examination',
      nameKey: 'final examination',
      order: 3,
      status: 'inactive',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      name: 'Practical Examination',
      nameKey: 'long answer',
      order: 4,
      status: 'active',
      deletedAt: new Date(),
    },
    {
      tenantId: riverton._id,
      name: 'Quarterly Examination',
      nameKey: 'match the following',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: riverton._id,
      name: 'Annual Examination',
      nameKey: 'true or false',
      order: 2,
      status: 'active',
      deletedAt: null,
    },
  ]);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

describe('School exam types (e2e)', () => {
  describe('access control', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer()).get('/api/exam-types').expect(401);
      await request(app.getHttpServer())
        .post('/api/exam-types')
        .send({ name: 'No Token', order: 1 })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/exam-types/${new Types.ObjectId().toString()}`)
        .send({ name: 'No Token' })
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/exam-types/${new Types.ObjectId().toString()}`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/exam-types/${new Types.ObjectId().toString()}/restore`)
        .expect(401);
    });

    it('lets teachers read but not manage exam types', async () => {
      const teacherToken = await appToken(TEACHER_EMAIL, PASSWORD);
      const fixture = await findExamType('Unit Test');

      const listed = await listExamTypes(teacherToken).expect(200);

      expect(listed.body.total).toBe(3);

      await createExamType(teacherToken, {
        name: 'Teacher Exam',
        order: 9,
      }).expect(403);
      await patchExamType(teacherToken, fixture._id.toString(), {
        name: 'Teacher Edit',
      }).expect(403);
      await deleteExamType(teacherToken, fixture._id.toString()).expect(403);
      await restoreExamType(teacherToken, fixture._id.toString()).expect(403);
    });
  });

  describe('list', () => {
    it('returns seeded exam types with a live summary', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await listExamTypes(token).expect(200);

      expect(response.body.total).toBe(3);
      expect(response.body.page).toBe(1);
      expect(response.body.pageSize).toBe(10);
      expect(response.body.summary).toEqual({
        active: 2,
        inactive: 1,
        deleted: 1,
      });

      const names = (response.body.items as { name: string }[]).map(
        (item) => item.name,
      );

      expect(names).toEqual([
        'Unit Test',
        'Mid-Term Examination',
        'Final Examination',
      ]);

      const first = response.body.items[0] as Record<string, unknown>;

      expect(first).toMatchObject({
        name: 'Unit Test',
        order: 1,
        status: 'active',
        deletedAt: null,
      });
      expect(typeof first['id']).toBe('string');
      expect(typeof first['createdAt']).toBe('string');
      expect(typeof first['updatedAt']).toBe('string');
    });

    it('searches and filters by status', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const byName = await listExamTypes(token, {
        search: 'MID',
      }).expect(200);

      expect(byName.body.total).toBe(1);
      expect(byName.body.items[0].name).toBe('Mid-Term Examination');

      const escaped = await listExamTypes(token, {
        search: 'Unit*',
      }).expect(200);

      expect(escaped.body.total).toBe(0);

      const inactive = await listExamTypes(token, {
        status: 'inactive',
      }).expect(200);

      expect(inactive.body.total).toBe(1);
      expect(inactive.body.items[0].name).toBe('Final Examination');

      const blankStatus = await listExamTypes(token, {
        status: '',
      }).expect(200);

      expect(blankStatus.body.total).toBe(3);
    });

    it('sorts and paginates', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const byName = await listExamTypes(token, {
        sort: 'name',
        dir: 'asc',
      }).expect(200);

      expect(
        (byName.body.items as { name: string }[]).map((item) => item.name),
      ).toEqual(['Final Examination', 'Mid-Term Examination', 'Unit Test']);

      const latest = await createViaApi(token, {
        name: 'Zulu Latest',
        order: 99,
      });

      const newest = await listExamTypes(token, {
        sort: 'createdAt',
        dir: 'desc',
      }).expect(200);

      expect(newest.body.items[0].id).toBe(latest.id);

      for (let index = 0; index < 8; index += 1) {
        await createViaApi(token, { name: `Paging Fixture ${index}` });
      }

      const page = await listExamTypes(token, {
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

      await listExamTypes(token, { status: 'archived' }).expect(400);
      await listExamTypes(token, { sort: 'email' }).expect(400);
      await listExamTypes(token, { dir: 'sideways' }).expect(400);
      await listExamTypes(token, { pageSize: 15 }).expect(400);
      await listExamTypes(token, { page: 0 }).expect(400);
      await listExamTypes(token, { page: 'abc' }).expect(400);
    });
  });

  describe('create', () => {
    it('creates a exam type with order and trims the name', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await createExamType(token, {
        name: '  Pre-Board Examination  ',
        order: 10,
      }).expect(201);

      expect(response.body).toMatchObject({
        name: 'Pre-Board Examination',
        order: 10,
        status: 'active',
        deletedAt: null,
      });
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.createdAt).toBe('string');
      expect(typeof response.body.updatedAt).toBe('string');

      const detail = await listExamTypes(token, {
        search: 'Pre-Board Examination',
      }).expect(200);

      expect(detail.body.total).toBe(1);
    });

    it('honours an explicit status', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await createExamType(token, {
        name: 'Open Book Test',
        order: 11,
        status: 'inactive',
      }).expect(201);

      expect(response.body.status).toBe('inactive');
    });

    it('rejects duplicate names case-insensitively', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const duplicate = await createExamType(token, {
        name: 'mid-term examination',
        order: 12,
      }).expect(409);

      expect(duplicate.body.message).toContain('already exists');

      await createExamType(token, {
        name: ' MID-TERM EXAMINATION ',
        order: 12,
      }).expect(409);
    });

    it('rejects invalid payloads', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await createExamType(token, {}).expect(400);
      await createExamType(token, { name: 'E', order: 1 }).expect(400);
      await createExamType(token, {
        name: 'x'.repeat(61),
        order: 1,
      }).expect(400);
      await createExamType(token, { name: 'No Order' }).expect(400);
      await createExamType(token, { name: 'Bad Order', order: 0 }).expect(400);
      await createExamType(token, { name: 'Bad Order', order: 101 }).expect(
        400,
      );
      await createExamType(token, { name: 'Bad Order', order: 1.5 }).expect(
        400,
      );
      await createExamType(token, {
        name: 'Bad Status',
        order: 1,
        status: 'archived',
      }).expect(400);
      await createExamType(token, {
        name: 'Bad Field',
        order: 1,
        unknown: true,
      }).expect(400);
    });
  });

  describe('update', () => {
    it('renames, reorders and toggles the status', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const renamed = await patchExamType(token, fixture.id, {
        name: 'Renamed Fixture',
      }).expect(200);

      expect(renamed.body).toMatchObject({
        id: fixture.id,
        name: 'Renamed Fixture',
        order: 90,
        status: 'active',
      });
      expect(new Date(renamed.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(renamed.body.createdAt).getTime(),
      );

      const reordered = await patchExamType(token, fixture.id, {
        order: 7,
      }).expect(200);

      expect(reordered.body.order).toBe(7);

      const toggled = await patchExamType(token, fixture.id, {
        status: 'inactive',
      }).expect(200);

      expect(toggled.body.status).toBe('inactive');

      const sameName = await patchExamType(token, fixture.id, {
        name: 'Renamed Fixture',
      }).expect(200);

      expect(sameName.body.name).toBe('Renamed Fixture');
    });

    it('rejects renaming to an existing name', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const duplicate = await patchExamType(token, fixture.id, {
        name: 'mid-term examination',
      }).expect(409);

      expect(duplicate.body.message).toContain('already exists');
    });

    it('rejects invalid payloads and unknown exam types', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await patchExamType(token, fixture.id, { name: 'X' }).expect(400);
      await patchExamType(token, fixture.id, { order: 0 }).expect(400);
      await patchExamType(token, fixture.id, { order: 101 }).expect(400);
      await patchExamType(token, fixture.id, { status: 'archived' }).expect(
        400,
      );
      await patchExamType(token, 'not-an-id', {
        name: 'Ghost Exam',
      }).expect(404);
      await patchExamType(token, new Types.ObjectId().toString(), {
        name: 'Ghost Exam',
      }).expect(404);
    });
  });

  describe('delete', () => {
    it('soft deletes and hides the exam type from the default list', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteExamType(token, fixture.id).expect(204);

      const hidden = await listExamTypes(token, {
        search: fixture.name,
      }).expect(200);

      expect(hidden.body.total).toBe(0);

      const included = await listExamTypes(token, {
        search: fixture.name,
        includeDeleted: 'true',
      }).expect(200);

      expect(included.body.total).toBe(1);
      expect(included.body.items[0]).toMatchObject({
        id: fixture.id,
        status: 'active',
      });
      expect(typeof included.body.items[0].deletedAt).toBe('string');

      await deleteExamType(token, fixture.id).expect(404);

      const raw = await examTypeModel.findById(fixture.id).exec();

      expect(raw?.deletedAt).toBeInstanceOf(Date);
    });

    it('frees the name for reuse after deletion', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Reusable ${new Types.ObjectId().toString()}`;
      const response = await createExamType(token, {
        name,
        order: 30,
      }).expect(201);

      await deleteExamType(token, response.body.id as string).expect(204);
      await createExamType(token, { name, order: 30 }).expect(201);
    });

    it('rejects unknown exam types', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await deleteExamType(token, 'not-an-id').expect(404);
      await deleteExamType(token, new Types.ObjectId().toString()).expect(404);
    });
  });

  describe('restore', () => {
    it('restores a deleted exam type', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteExamType(token, fixture.id).expect(204);

      const restored = await restoreExamType(token, fixture.id).expect(200);

      expect(restored.body).toMatchObject({
        id: fixture.id,
        name: fixture.name,
        order: 90,
        deletedAt: null,
      });

      const visible = await listExamTypes(token, {
        search: fixture.name,
      }).expect(200);

      expect(visible.body.total).toBe(1);

      await restoreExamType(token, fixture.id).expect(404);
    });

    it('refuses to restore when the name was reused', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Conflict ${new Types.ObjectId().toString()}`;
      const first = await createExamType(token, {
        name,
        order: 40,
      }).expect(201);

      await deleteExamType(token, first.body.id as string).expect(204);
      await createExamType(token, { name, order: 40 }).expect(201);

      const conflict = await restoreExamType(
        token,
        first.body.id as string,
      ).expect(409);

      expect(conflict.body.message).toContain('already exists');
    });

    it('rejects unknown or live exam types', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await restoreExamType(token, 'not-an-id').expect(404);
      await restoreExamType(token, new Types.ObjectId().toString()).expect(404);
      await restoreExamType(token, fixture.id).expect(404);
    });
  });

  describe('tenant isolation', () => {
    it('keeps other tenants out of exam types', async () => {
      const greenwoodToken = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const rivertonToken = await appToken(RIVERTON_PRINCIPAL_EMAIL, PASSWORD);

      const rivertonList = await listExamTypes(rivertonToken).expect(200);

      expect(rivertonList.body.total).toBe(2);
      expect(
        (rivertonList.body.items as { name: string }[]).map(
          (item) => item.name,
        ),
      ).toEqual(['Quarterly Examination', 'Annual Examination']);

      const fixture = await createViaApi(greenwoodToken);

      await patchExamType(rivertonToken, fixture.id, {
        name: 'Stolen Exam',
      }).expect(404);
      await deleteExamType(rivertonToken, fixture.id).expect(404);
      await restoreExamType(rivertonToken, fixture.id).expect(404);

      const rivertonSearch = await listExamTypes(rivertonToken, {
        search: fixture.name,
        includeDeleted: 'true',
      }).expect(200);

      expect(rivertonSearch.body.total).toBe(0);
    });
  });
});
