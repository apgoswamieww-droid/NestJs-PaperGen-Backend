import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import { MailService } from '../src/mail/mail.service.js';
import {
  QuestionType,
  type QuestionTypeDocument,
} from '../src/schemas/question-type.schema.js';
import { Tenant } from '../src/schemas/tenant.schema.js';
import { User } from '../src/schemas/user.schema.js';

const PASSWORD = 'School@12345';
const PRINCIPAL_EMAIL = 'principal@greenwood.test';
const TEACHER_EMAIL = 'teacher@greenwood.test';
const RIVERTON_PRINCIPAL_EMAIL = 'principal@riverton.test';

let app: INestApplication;
let mongo: MongoMemoryServer;
let questionTypeModel: Model<QuestionType>;

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

async function appToken(email: string, password: string): Promise<string> {
  const response = await login(email, password).expect(200);

  return response.body.accessToken as string;
}

function listQuestionTypes(token: string, query: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .get('/api/question-types')
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

function createQuestionType(token: string, payload: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post('/api/question-types')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function patchQuestionType(
  token: string,
  id: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .patch(`/api/question-types/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function deleteQuestionType(token: string, id: string) {
  return request(app.getHttpServer())
    .delete(`/api/question-types/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

function restoreQuestionType(token: string, id: string) {
  return request(app.getHttpServer())
    .post(`/api/question-types/${id}/restore`)
    .set('Authorization', `Bearer ${token}`);
}

async function findQuestionType(name: string): Promise<QuestionTypeDocument> {
  const questionType = await questionTypeModel.findOne({ name }).exec();

  if (!questionType) {
    throw new Error(`Seeded question type ${name} was not found.`);
  }

  return questionType;
}

async function createViaApi(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const name = `Fixture ${new Types.ObjectId().toString()}`;
  const response = await createQuestionType(token, {
    name,
    order: 90,
    ...overrides,
  }).expect(201);

  return { id: response.body.id as string, name: response.body.name as string };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri(
    'papergen-school-question-types-test',
  );
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

  questionTypeModel = app.get<Model<QuestionType>>(
    getModelToken(QuestionType.name),
  );

  const passwordHash = await passwordService.hash(PASSWORD);

  const greenwood = await tenantModel.create({
    name: 'Greenwood High',
    slug: 'greenwood-question-types',
    type: 'school',
    plan: 'growth',
    status: 'active',
  });
  const riverton = await tenantModel.create({
    name: 'Riverton School',
    slug: 'riverton-question-types',
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

  await questionTypeModel.create([
    {
      tenantId: greenwood._id,
      name: 'Multiple Choice Questions',
      nameKey: 'multiple choice questions',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      name: 'Fill in the Blanks',
      nameKey: 'fill in the blanks',
      order: 2,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      name: 'Short Answer',
      nameKey: 'short answer',
      order: 3,
      status: 'inactive',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      name: 'Long Answer',
      nameKey: 'long answer',
      order: 4,
      status: 'active',
      deletedAt: new Date(),
    },
    {
      tenantId: riverton._id,
      name: 'Match the Following',
      nameKey: 'match the following',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: riverton._id,
      name: 'True or False',
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

describe('School question types (e2e)', () => {
  describe('access control', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer()).get('/api/question-types').expect(401);
      await request(app.getHttpServer())
        .post('/api/question-types')
        .send({ name: 'No Token', order: 1 })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/question-types/${new Types.ObjectId().toString()}`)
        .send({ name: 'No Token' })
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/question-types/${new Types.ObjectId().toString()}`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/question-types/${new Types.ObjectId().toString()}/restore`)
        .expect(401);
    });

    it('lets teachers read but not manage question types', async () => {
      const teacherToken = await appToken(TEACHER_EMAIL, PASSWORD);
      const fixture = await findQuestionType('Multiple Choice Questions');

      const listed = await listQuestionTypes(teacherToken).expect(200);

      expect(listed.body.total).toBe(3);

      await createQuestionType(teacherToken, {
        name: 'Teacher Type',
        order: 9,
      }).expect(403);
      await patchQuestionType(teacherToken, fixture._id.toString(), {
        name: 'Teacher Edit',
      }).expect(403);
      await deleteQuestionType(teacherToken, fixture._id.toString()).expect(
        403,
      );
      await restoreQuestionType(teacherToken, fixture._id.toString()).expect(
        403,
      );
    });
  });

  describe('list', () => {
    it('returns seeded question types with a live summary', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await listQuestionTypes(token).expect(200);

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
        'Multiple Choice Questions',
        'Fill in the Blanks',
        'Short Answer',
      ]);

      const first = response.body.items[0] as Record<string, unknown>;

      expect(first).toMatchObject({
        name: 'Multiple Choice Questions',
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

      const byName = await listQuestionTypes(token, {
        search: 'FILL',
      }).expect(200);

      expect(byName.body.total).toBe(1);
      expect(byName.body.items[0].name).toBe('Fill in the Blanks');

      const escaped = await listQuestionTypes(token, {
        search: 'Multi*',
      }).expect(200);

      expect(escaped.body.total).toBe(0);

      const inactive = await listQuestionTypes(token, {
        status: 'inactive',
      }).expect(200);

      expect(inactive.body.total).toBe(1);
      expect(inactive.body.items[0].name).toBe('Short Answer');

      const blankStatus = await listQuestionTypes(token, {
        status: '',
      }).expect(200);

      expect(blankStatus.body.total).toBe(3);
    });

    it('sorts and paginates', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const byName = await listQuestionTypes(token, {
        sort: 'name',
        dir: 'asc',
      }).expect(200);

      expect(
        (byName.body.items as { name: string }[]).map((item) => item.name),
      ).toEqual([
        'Fill in the Blanks',
        'Multiple Choice Questions',
        'Short Answer',
      ]);

      const latest = await createViaApi(token, {
        name: 'Zulu Latest',
        order: 99,
      });

      const newest = await listQuestionTypes(token, {
        sort: 'createdAt',
        dir: 'desc',
      }).expect(200);

      expect(newest.body.items[0].id).toBe(latest.id);

      for (let index = 0; index < 8; index += 1) {
        await createViaApi(token, { name: `Paging Fixture ${index}` });
      }

      const page = await listQuestionTypes(token, {
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

      await listQuestionTypes(token, { status: 'archived' }).expect(400);
      await listQuestionTypes(token, { sort: 'email' }).expect(400);
      await listQuestionTypes(token, { dir: 'sideways' }).expect(400);
      await listQuestionTypes(token, { pageSize: 15 }).expect(400);
      await listQuestionTypes(token, { page: 0 }).expect(400);
      await listQuestionTypes(token, { page: 'abc' }).expect(400);
    });
  });

  describe('create', () => {
    it('creates a question type with order and trims the name', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await createQuestionType(token, {
        name: '  Diagram Based  ',
        order: 10,
      }).expect(201);

      expect(response.body).toMatchObject({
        name: 'Diagram Based',
        order: 10,
        status: 'active',
        deletedAt: null,
      });
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.createdAt).toBe('string');
      expect(typeof response.body.updatedAt).toBe('string');

      const detail = await listQuestionTypes(token, {
        search: 'Diagram Based',
      }).expect(200);

      expect(detail.body.total).toBe(1);
    });

    it('honours an explicit status', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await createQuestionType(token, {
        name: 'Case Study',
        order: 11,
        status: 'inactive',
      }).expect(201);

      expect(response.body.status).toBe('inactive');
    });

    it('rejects duplicate names case-insensitively', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const duplicate = await createQuestionType(token, {
        name: 'fill in the blanks',
        order: 12,
      }).expect(409);

      expect(duplicate.body.message).toContain('already exists');

      await createQuestionType(token, {
        name: ' FILL IN THE BLANKS ',
        order: 12,
      }).expect(409);
    });

    it('rejects invalid payloads', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await createQuestionType(token, {}).expect(400);
      await createQuestionType(token, { name: 'E', order: 1 }).expect(400);
      await createQuestionType(token, {
        name: 'x'.repeat(61),
        order: 1,
      }).expect(400);
      await createQuestionType(token, { name: 'No Order' }).expect(400);
      await createQuestionType(token, { name: 'Bad Order', order: 0 }).expect(
        400,
      );
      await createQuestionType(token, { name: 'Bad Order', order: 101 }).expect(
        400,
      );
      await createQuestionType(token, { name: 'Bad Order', order: 1.5 }).expect(
        400,
      );
      await createQuestionType(token, {
        name: 'Bad Status',
        order: 1,
        status: 'archived',
      }).expect(400);
      await createQuestionType(token, {
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

      const renamed = await patchQuestionType(token, fixture.id, {
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

      const reordered = await patchQuestionType(token, fixture.id, {
        order: 7,
      }).expect(200);

      expect(reordered.body.order).toBe(7);

      const toggled = await patchQuestionType(token, fixture.id, {
        status: 'inactive',
      }).expect(200);

      expect(toggled.body.status).toBe('inactive');

      const sameName = await patchQuestionType(token, fixture.id, {
        name: 'Renamed Fixture',
      }).expect(200);

      expect(sameName.body.name).toBe('Renamed Fixture');
    });

    it('rejects renaming to an existing name', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const duplicate = await patchQuestionType(token, fixture.id, {
        name: 'fill in the blanks',
      }).expect(409);

      expect(duplicate.body.message).toContain('already exists');
    });

    it('rejects invalid payloads and unknown question types', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await patchQuestionType(token, fixture.id, { name: 'X' }).expect(400);
      await patchQuestionType(token, fixture.id, { order: 0 }).expect(400);
      await patchQuestionType(token, fixture.id, { order: 101 }).expect(400);
      await patchQuestionType(token, fixture.id, { status: 'archived' }).expect(
        400,
      );
      await patchQuestionType(token, 'not-an-id', {
        name: 'Ghost Type',
      }).expect(404);
      await patchQuestionType(token, new Types.ObjectId().toString(), {
        name: 'Ghost Type',
      }).expect(404);
    });
  });

  describe('delete', () => {
    it('soft deletes and hides the question type from the default list', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteQuestionType(token, fixture.id).expect(204);

      const hidden = await listQuestionTypes(token, {
        search: fixture.name,
      }).expect(200);

      expect(hidden.body.total).toBe(0);

      const included = await listQuestionTypes(token, {
        search: fixture.name,
        includeDeleted: 'true',
      }).expect(200);

      expect(included.body.total).toBe(1);
      expect(included.body.items[0]).toMatchObject({
        id: fixture.id,
        status: 'active',
      });
      expect(typeof included.body.items[0].deletedAt).toBe('string');

      await deleteQuestionType(token, fixture.id).expect(404);

      const raw = await questionTypeModel.findById(fixture.id).exec();

      expect(raw?.deletedAt).toBeInstanceOf(Date);
    });

    it('frees the name for reuse after deletion', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Reusable ${new Types.ObjectId().toString()}`;
      const response = await createQuestionType(token, {
        name,
        order: 30,
      }).expect(201);

      await deleteQuestionType(token, response.body.id as string).expect(204);
      await createQuestionType(token, { name, order: 30 }).expect(201);
    });

    it('rejects unknown question types', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await deleteQuestionType(token, 'not-an-id').expect(404);
      await deleteQuestionType(token, new Types.ObjectId().toString()).expect(
        404,
      );
    });
  });

  describe('restore', () => {
    it('restores a deleted question type', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteQuestionType(token, fixture.id).expect(204);

      const restored = await restoreQuestionType(token, fixture.id).expect(200);

      expect(restored.body).toMatchObject({
        id: fixture.id,
        name: fixture.name,
        order: 90,
        deletedAt: null,
      });

      const visible = await listQuestionTypes(token, {
        search: fixture.name,
      }).expect(200);

      expect(visible.body.total).toBe(1);

      await restoreQuestionType(token, fixture.id).expect(404);
    });

    it('refuses to restore when the name was reused', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Conflict ${new Types.ObjectId().toString()}`;
      const first = await createQuestionType(token, {
        name,
        order: 40,
      }).expect(201);

      await deleteQuestionType(token, first.body.id as string).expect(204);
      await createQuestionType(token, { name, order: 40 }).expect(201);

      const conflict = await restoreQuestionType(
        token,
        first.body.id as string,
      ).expect(409);

      expect(conflict.body.message).toContain('already exists');
    });

    it('rejects unknown or live question types', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await restoreQuestionType(token, 'not-an-id').expect(404);
      await restoreQuestionType(token, new Types.ObjectId().toString()).expect(
        404,
      );
      await restoreQuestionType(token, fixture.id).expect(404);
    });
  });

  describe('tenant isolation', () => {
    it('keeps other tenants out of question types', async () => {
      const greenwoodToken = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const rivertonToken = await appToken(RIVERTON_PRINCIPAL_EMAIL, PASSWORD);

      const rivertonList = await listQuestionTypes(rivertonToken).expect(200);

      expect(rivertonList.body.total).toBe(2);
      expect(
        (rivertonList.body.items as { name: string }[]).map(
          (item) => item.name,
        ),
      ).toEqual(['Match the Following', 'True or False']);

      const fixture = await createViaApi(greenwoodToken);

      await patchQuestionType(rivertonToken, fixture.id, {
        name: 'Stolen Type',
      }).expect(404);
      await deleteQuestionType(rivertonToken, fixture.id).expect(404);
      await restoreQuestionType(rivertonToken, fixture.id).expect(404);

      const rivertonSearch = await listQuestionTypes(rivertonToken, {
        search: fixture.name,
        includeDeleted: 'true',
      }).expect(200);

      expect(rivertonSearch.body.total).toBe(0);
    });
  });
});
