import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import { MailService } from '../src/mail/mail.service.js';
import {
  DifficultyLevel,
  type DifficultyLevelDocument,
} from '../src/schemas/difficulty-level.schema.js';
import { Tenant } from '../src/schemas/tenant.schema.js';
import { User } from '../src/schemas/user.schema.js';

const PASSWORD = 'School@12345';
const PRINCIPAL_EMAIL = 'principal@greenwood.test';
const TEACHER_EMAIL = 'teacher@greenwood.test';
const RIVERTON_PRINCIPAL_EMAIL = 'principal@riverton.test';

let app: INestApplication;
let mongo: MongoMemoryServer;
let difficultyLevelModel: Model<DifficultyLevel>;

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

async function appToken(email: string, password: string): Promise<string> {
  const response = await login(email, password).expect(200);

  return response.body.accessToken as string;
}

function listDifficultyLevels(
  token: string,
  query: Record<string, unknown> = {},
) {
  return request(app.getHttpServer())
    .get('/api/difficulty-levels')
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

function createDifficultyLevel(
  token: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .post('/api/difficulty-levels')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function patchDifficultyLevel(
  token: string,
  id: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .patch(`/api/difficulty-levels/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function deleteDifficultyLevel(token: string, id: string) {
  return request(app.getHttpServer())
    .delete(`/api/difficulty-levels/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

function restoreDifficultyLevel(token: string, id: string) {
  return request(app.getHttpServer())
    .post(`/api/difficulty-levels/${id}/restore`)
    .set('Authorization', `Bearer ${token}`);
}

async function findDifficultyLevel(
  name: string,
): Promise<DifficultyLevelDocument> {
  const difficultyLevel = await difficultyLevelModel.findOne({ name }).exec();

  if (!difficultyLevel) {
    throw new Error(`Seeded difficulty level ${name} was not found.`);
  }

  return difficultyLevel;
}

async function createViaApi(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const name = `Fixture ${new Types.ObjectId().toString()}`;
  const response = await createDifficultyLevel(token, {
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
    'papergen-school-difficulty-levels-test',
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

  difficultyLevelModel = app.get<Model<DifficultyLevel>>(
    getModelToken(DifficultyLevel.name),
  );

  const passwordHash = await passwordService.hash(PASSWORD);

  const greenwood = await tenantModel.create({
    name: 'Greenwood High',
    slug: 'greenwood-difficulty-levels',
    type: 'school',
    plan: 'growth',
    status: 'active',
  });
  const riverton = await tenantModel.create({
    name: 'Riverton School',
    slug: 'riverton-difficulty-levels',
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

  await difficultyLevelModel.create([
    {
      tenantId: greenwood._id,
      name: 'Easy',
      nameKey: 'easy',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      name: 'Medium',
      nameKey: 'medium',
      order: 2,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      name: 'Hard',
      nameKey: 'hard',
      order: 3,
      status: 'inactive',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      name: 'Challenge',
      nameKey: 'challenge',
      order: 4,
      status: 'active',
      deletedAt: new Date(),
    },
    {
      tenantId: riverton._id,
      name: 'Beginner',
      nameKey: 'beginner',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: riverton._id,
      name: 'Advanced',
      nameKey: 'advanced',
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

describe('School difficulty levels (e2e)', () => {
  describe('access control', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/difficulty-levels')
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/difficulty-levels')
        .send({ name: 'No Token', order: 1 })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/difficulty-levels/${new Types.ObjectId().toString()}`)
        .send({ name: 'No Token' })
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/difficulty-levels/${new Types.ObjectId().toString()}`)
        .expect(401);
      await request(app.getHttpServer())
        .post(
          `/api/difficulty-levels/${new Types.ObjectId().toString()}/restore`,
        )
        .expect(401);
    });

    it('lets teachers read but not manage difficulty levels', async () => {
      const teacherToken = await appToken(TEACHER_EMAIL, PASSWORD);
      const fixture = await findDifficultyLevel('Easy');

      const listed = await listDifficultyLevels(teacherToken).expect(200);

      expect(listed.body.total).toBe(3);

      await createDifficultyLevel(teacherToken, {
        name: 'Teacher Level',
        order: 9,
      }).expect(403);
      await patchDifficultyLevel(teacherToken, fixture._id.toString(), {
        name: 'Teacher Edit',
      }).expect(403);
      await deleteDifficultyLevel(teacherToken, fixture._id.toString()).expect(
        403,
      );
      await restoreDifficultyLevel(teacherToken, fixture._id.toString()).expect(
        403,
      );
    });
  });

  describe('list', () => {
    it('returns seeded difficulty levels with a live summary', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await listDifficultyLevels(token).expect(200);

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

      expect(names).toEqual(['Easy', 'Medium', 'Hard']);

      const first = response.body.items[0] as Record<string, unknown>;

      expect(first).toMatchObject({
        name: 'Easy',
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

      const byName = await listDifficultyLevels(token, {
        search: 'HAR',
      }).expect(200);

      expect(byName.body.total).toBe(1);
      expect(byName.body.items[0].name).toBe('Hard');

      const escaped = await listDifficultyLevels(token, {
        search: 'Ea*',
      }).expect(200);

      expect(escaped.body.total).toBe(0);

      const inactive = await listDifficultyLevels(token, {
        status: 'inactive',
      }).expect(200);

      expect(inactive.body.total).toBe(1);
      expect(inactive.body.items[0].name).toBe('Hard');

      const blankStatus = await listDifficultyLevels(token, {
        status: '',
      }).expect(200);

      expect(blankStatus.body.total).toBe(3);
    });

    it('sorts and paginates', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const byName = await listDifficultyLevels(token, {
        sort: 'name',
        dir: 'asc',
      }).expect(200);

      expect(
        (byName.body.items as { name: string }[]).map((item) => item.name),
      ).toEqual(['Easy', 'Hard', 'Medium']);

      const latest = await createViaApi(token, {
        name: 'Zulu Latest',
        order: 99,
      });

      const newest = await listDifficultyLevels(token, {
        sort: 'createdAt',
        dir: 'desc',
      }).expect(200);

      expect(newest.body.items[0].id).toBe(latest.id);

      for (let index = 0; index < 8; index += 1) {
        await createViaApi(token, { name: `Paging Fixture ${index}` });
      }

      const page = await listDifficultyLevels(token, {
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

      await listDifficultyLevels(token, { status: 'archived' }).expect(400);
      await listDifficultyLevels(token, { sort: 'email' }).expect(400);
      await listDifficultyLevels(token, { dir: 'sideways' }).expect(400);
      await listDifficultyLevels(token, { pageSize: 15 }).expect(400);
      await listDifficultyLevels(token, { page: 0 }).expect(400);
      await listDifficultyLevels(token, { page: 'abc' }).expect(400);
    });
  });

  describe('create', () => {
    it('creates a difficulty level with order and trims the name', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await createDifficultyLevel(token, {
        name: '  Expert  ',
        order: 10,
      }).expect(201);

      expect(response.body).toMatchObject({
        name: 'Expert',
        order: 10,
        status: 'active',
        deletedAt: null,
      });
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.createdAt).toBe('string');
      expect(typeof response.body.updatedAt).toBe('string');

      const detail = await listDifficultyLevels(token, {
        search: 'Expert',
      }).expect(200);

      expect(detail.body.total).toBe(1);
    });

    it('honours an explicit status', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await createDifficultyLevel(token, {
        name: 'Warm Up',
        order: 11,
        status: 'inactive',
      }).expect(201);

      expect(response.body.status).toBe('inactive');
    });

    it('rejects duplicate names case-insensitively', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const duplicate = await createDifficultyLevel(token, {
        name: 'easy',
        order: 12,
      }).expect(409);

      expect(duplicate.body.message).toContain('already exists');

      await createDifficultyLevel(token, {
        name: ' EASY ',
        order: 12,
      }).expect(409);
    });

    it('rejects invalid payloads', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await createDifficultyLevel(token, {}).expect(400);
      await createDifficultyLevel(token, { name: 'E', order: 1 }).expect(400);
      await createDifficultyLevel(token, {
        name: 'x'.repeat(61),
        order: 1,
      }).expect(400);
      await createDifficultyLevel(token, { name: 'No Order' }).expect(400);
      await createDifficultyLevel(token, {
        name: 'Bad Order',
        order: 0,
      }).expect(400);
      await createDifficultyLevel(token, {
        name: 'Bad Order',
        order: 101,
      }).expect(400);
      await createDifficultyLevel(token, {
        name: 'Bad Order',
        order: 1.5,
      }).expect(400);
      await createDifficultyLevel(token, {
        name: 'Bad Status',
        order: 1,
        status: 'archived',
      }).expect(400);
      await createDifficultyLevel(token, {
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

      const renamed = await patchDifficultyLevel(token, fixture.id, {
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

      const reordered = await patchDifficultyLevel(token, fixture.id, {
        order: 7,
      }).expect(200);

      expect(reordered.body.order).toBe(7);

      const toggled = await patchDifficultyLevel(token, fixture.id, {
        status: 'inactive',
      }).expect(200);

      expect(toggled.body.status).toBe('inactive');

      const sameName = await patchDifficultyLevel(token, fixture.id, {
        name: 'Renamed Fixture',
      }).expect(200);

      expect(sameName.body.name).toBe('Renamed Fixture');
    });

    it('rejects renaming to an existing name', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const duplicate = await patchDifficultyLevel(token, fixture.id, {
        name: 'easy',
      }).expect(409);

      expect(duplicate.body.message).toContain('already exists');
    });

    it('rejects invalid payloads and unknown difficulty levels', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await patchDifficultyLevel(token, fixture.id, { name: 'X' }).expect(400);
      await patchDifficultyLevel(token, fixture.id, { order: 0 }).expect(400);
      await patchDifficultyLevel(token, fixture.id, { order: 101 }).expect(400);
      await patchDifficultyLevel(token, fixture.id, {
        status: 'archived',
      }).expect(400);
      await patchDifficultyLevel(token, 'not-an-id', {
        name: 'Ghost Level',
      }).expect(404);
      await patchDifficultyLevel(token, new Types.ObjectId().toString(), {
        name: 'Ghost Level',
      }).expect(404);
    });
  });

  describe('delete', () => {
    it('soft deletes and hides the difficulty level from the default list', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteDifficultyLevel(token, fixture.id).expect(204);

      const hidden = await listDifficultyLevels(token, {
        search: fixture.name,
      }).expect(200);

      expect(hidden.body.total).toBe(0);

      const included = await listDifficultyLevels(token, {
        search: fixture.name,
        includeDeleted: 'true',
      }).expect(200);

      expect(included.body.total).toBe(1);
      expect(included.body.items[0]).toMatchObject({
        id: fixture.id,
        status: 'active',
      });
      expect(typeof included.body.items[0].deletedAt).toBe('string');

      await deleteDifficultyLevel(token, fixture.id).expect(404);

      const raw = await difficultyLevelModel.findById(fixture.id).exec();

      expect(raw?.deletedAt).toBeInstanceOf(Date);
    });

    it('frees the name for reuse after deletion', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Reusable ${new Types.ObjectId().toString()}`;
      const response = await createDifficultyLevel(token, {
        name,
        order: 30,
      }).expect(201);

      await deleteDifficultyLevel(token, response.body.id as string).expect(
        204,
      );
      await createDifficultyLevel(token, { name, order: 30 }).expect(201);
    });

    it('rejects unknown difficulty levels', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await deleteDifficultyLevel(token, 'not-an-id').expect(404);
      await deleteDifficultyLevel(
        token,
        new Types.ObjectId().toString(),
      ).expect(404);
    });
  });

  describe('restore', () => {
    it('restores a deleted difficulty level', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteDifficultyLevel(token, fixture.id).expect(204);

      const restored = await restoreDifficultyLevel(token, fixture.id).expect(
        200,
      );

      expect(restored.body).toMatchObject({
        id: fixture.id,
        name: fixture.name,
        order: 90,
        deletedAt: null,
      });

      const visible = await listDifficultyLevels(token, {
        search: fixture.name,
      }).expect(200);

      expect(visible.body.total).toBe(1);

      await restoreDifficultyLevel(token, fixture.id).expect(404);
    });

    it('refuses to restore when the name was reused', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Conflict ${new Types.ObjectId().toString()}`;
      const first = await createDifficultyLevel(token, {
        name,
        order: 40,
      }).expect(201);

      await deleteDifficultyLevel(token, first.body.id as string).expect(204);
      await createDifficultyLevel(token, { name, order: 40 }).expect(201);

      const conflict = await restoreDifficultyLevel(
        token,
        first.body.id as string,
      ).expect(409);

      expect(conflict.body.message).toContain('already exists');
    });

    it('rejects unknown or live difficulty levels', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await restoreDifficultyLevel(token, 'not-an-id').expect(404);
      await restoreDifficultyLevel(
        token,
        new Types.ObjectId().toString(),
      ).expect(404);
      await restoreDifficultyLevel(token, fixture.id).expect(404);
    });
  });

  describe('tenant isolation', () => {
    it('keeps other tenants out of difficulty levels', async () => {
      const greenwoodToken = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const rivertonToken = await appToken(RIVERTON_PRINCIPAL_EMAIL, PASSWORD);

      const rivertonList =
        await listDifficultyLevels(rivertonToken).expect(200);

      expect(rivertonList.body.total).toBe(2);
      expect(
        (rivertonList.body.items as { name: string }[]).map(
          (item) => item.name,
        ),
      ).toEqual(['Beginner', 'Advanced']);

      const fixture = await createViaApi(greenwoodToken);

      await patchDifficultyLevel(rivertonToken, fixture.id, {
        name: 'Stolen Level',
      }).expect(404);
      await deleteDifficultyLevel(rivertonToken, fixture.id).expect(404);
      await restoreDifficultyLevel(rivertonToken, fixture.id).expect(404);

      const rivertonSearch = await listDifficultyLevels(rivertonToken, {
        search: fixture.name,
        includeDeleted: 'true',
      }).expect(200);

      expect(rivertonSearch.body.total).toBe(0);
    });
  });
});
