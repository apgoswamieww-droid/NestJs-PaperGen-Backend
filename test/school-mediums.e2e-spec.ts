import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { Medium, type MediumDocument } from '../src/schemas/medium.schema.js';
import { Tenant } from '../src/schemas/tenant.schema.js';
import { User } from '../src/schemas/user.schema.js';

const PASSWORD = 'School@12345';
const PRINCIPAL_EMAIL = 'principal@greenwood.test';
const TEACHER_EMAIL = 'teacher@greenwood.test';
const RIVERTON_PRINCIPAL_EMAIL = 'principal@riverton.test';

let app: INestApplication;
let mongo: MongoMemoryServer;
let mediumModel: Model<Medium>;

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

async function appToken(email: string, password: string): Promise<string> {
  const response = await login(email, password).expect(200);

  return response.body.accessToken as string;
}

function listMediums(token: string, query: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .get('/api/mediums')
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

function createMedium(token: string, payload: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post('/api/mediums')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function patchMedium(
  token: string,
  id: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .patch(`/api/mediums/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function deleteMedium(token: string, id: string) {
  return request(app.getHttpServer())
    .delete(`/api/mediums/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

function restoreMedium(token: string, id: string) {
  return request(app.getHttpServer())
    .post(`/api/mediums/${id}/restore`)
    .set('Authorization', `Bearer ${token}`);
}

async function findMedium(name: string): Promise<MediumDocument> {
  const medium = await mediumModel.findOne({ name }).exec();

  if (!medium) {
    throw new Error(`Seeded medium ${name} was not found.`);
  }

  return medium;
}

async function createViaApi(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const name = `Fixture ${new Types.ObjectId().toString()}`;
  const response = await createMedium(token, { name, ...overrides }).expect(
    201,
  );

  return { id: response.body.id as string, name: response.body.name as string };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-school-mediums-test');
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

  mediumModel = app.get<Model<Medium>>(getModelToken(Medium.name));

  const passwordHash = await passwordService.hash(PASSWORD);

  const greenwood = await tenantModel.create({
    name: 'Greenwood High',
    slug: 'greenwood-mediums',
    type: 'school',
    plan: 'growth',
    status: 'active',
  });
  const riverton = await tenantModel.create({
    name: 'Riverton School',
    slug: 'riverton-mediums',
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

  await mediumModel.create([
    {
      tenantId: greenwood._id,
      name: 'English',
      nameKey: 'english',
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      name: 'Hindi',
      nameKey: 'hindi',
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      name: 'Marathi',
      nameKey: 'marathi',
      status: 'inactive',
      deletedAt: null,
    },
    {
      tenantId: riverton._id,
      name: 'Kannada',
      nameKey: 'kannada',
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: riverton._id,
      name: 'Tamil',
      nameKey: 'tamil',
      status: 'active',
      deletedAt: null,
    },
  ]);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

describe('School mediums (e2e)', () => {
  describe('access control', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer()).get('/api/mediums').expect(401);
      await request(app.getHttpServer())
        .post('/api/mediums')
        .send({ name: 'No Token' })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/mediums/${new Types.ObjectId().toString()}`)
        .send({ name: 'No Token' })
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/mediums/${new Types.ObjectId().toString()}`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/mediums/${new Types.ObjectId().toString()}/restore`)
        .expect(401);
    });

    it('lets teachers read but not manage mediums', async () => {
      const teacherToken = await appToken(TEACHER_EMAIL, PASSWORD);

      const listed = await listMediums(teacherToken).expect(200);

      expect(listed.body.total).toBe(3);

      const fixture = await findMedium('English');

      await createMedium(teacherToken, { name: 'Teacher Medium' }).expect(403);
      await patchMedium(teacherToken, fixture._id.toString(), {
        name: 'Teacher Edit',
      }).expect(403);
      await deleteMedium(teacherToken, fixture._id.toString()).expect(403);
      await restoreMedium(teacherToken, fixture._id.toString()).expect(403);
    });
  });

  describe('list', () => {
    it('returns seeded mediums with a live summary', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await listMediums(token).expect(200);

      expect(response.body.total).toBe(3);
      expect(response.body.page).toBe(1);
      expect(response.body.pageSize).toBe(10);
      expect(response.body.summary).toEqual({
        active: 2,
        inactive: 1,
        deleted: 0,
      });

      const english = (response.body.items as Record<string, unknown>[]).find(
        (item) => item['name'] === 'English',
      );

      expect(english).toMatchObject({ status: 'active', deletedAt: null });
      expect(typeof english?.['id']).toBe('string');
      expect(typeof english?.['createdAt']).toBe('string');
      expect(typeof english?.['updatedAt']).toBe('string');
    });

    it('searches and filters by status', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const byName = await listMediums(token, { search: 'HIN' }).expect(200);

      expect(byName.body.total).toBe(1);
      expect(byName.body.items[0].name).toBe('Hindi');

      const escaped = await listMediums(token, { search: 'En*' }).expect(200);

      expect(escaped.body.total).toBe(0);

      const inactive = await listMediums(token, { status: 'inactive' }).expect(
        200,
      );

      expect(inactive.body.total).toBe(1);
      expect(inactive.body.items[0].name).toBe('Marathi');

      const blankStatus = await listMediums(token, { status: '' }).expect(200);

      expect(blankStatus.body.total).toBe(3);
    });

    it('sorts and paginates', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const sorted = await listMediums(token, {
        sort: 'name',
        dir: 'asc',
      }).expect(200);

      expect(
        (sorted.body.items as { name: string }[]).map((item) => item.name),
      ).toEqual(['English', 'Hindi', 'Marathi']);

      const latest = await createViaApi(token, { name: 'Zulu Latest' });

      const newest = await listMediums(token, {
        sort: 'createdAt',
        dir: 'desc',
      }).expect(200);

      expect(newest.body.items[0].id).toBe(latest.id);

      for (let index = 0; index < 8; index += 1) {
        await createViaApi(token, { name: `Paging Fixture ${index}` });
      }

      const page = await listMediums(token, {
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

      await listMediums(token, { status: 'archived' }).expect(400);
      await listMediums(token, { sort: 'email' }).expect(400);
      await listMediums(token, { dir: 'sideways' }).expect(400);
      await listMediums(token, { pageSize: 15 }).expect(400);
      await listMediums(token, { page: 0 }).expect(400);
      await listMediums(token, { page: 'abc' }).expect(400);
    });
  });

  describe('create', () => {
    it('creates a medium and trims the name', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await createMedium(token, {
        name: '  German  ',
      }).expect(201);

      expect(response.body).toMatchObject({
        name: 'German',
        status: 'active',
        deletedAt: null,
      });
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.createdAt).toBe('string');
      expect(typeof response.body.updatedAt).toBe('string');

      const detail = await listMediums(token, { search: 'German' }).expect(200);

      expect(detail.body.total).toBe(1);
    });

    it('honours an explicit status', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await createMedium(token, {
        name: 'French',
        status: 'inactive',
      }).expect(201);

      expect(response.body.status).toBe('inactive');
    });

    it('rejects duplicate names case-insensitively', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const duplicate = await createMedium(token, {
        name: 'english',
      }).expect(409);

      expect(duplicate.body.message).toContain('already exists');

      await createMedium(token, { name: ' ENGLISH ' }).expect(409);
    });

    it('rejects invalid payloads', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await createMedium(token, {}).expect(400);
      await createMedium(token, { name: 'E' }).expect(400);
      await createMedium(token, { name: 'x'.repeat(61) }).expect(400);
      await createMedium(token, {
        name: 'German 2',
        status: 'archived',
      }).expect(400);
      await createMedium(token, { name: 'German 2', unknown: true }).expect(
        400,
      );
    });
  });

  describe('update', () => {
    it('renames a medium and toggles its status', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const renamed = await patchMedium(token, fixture.id, {
        name: 'Renamed Fixture',
      }).expect(200);

      expect(renamed.body).toMatchObject({
        id: fixture.id,
        name: 'Renamed Fixture',
        status: 'active',
      });
      expect(new Date(renamed.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(renamed.body.createdAt).getTime(),
      );

      const toggled = await patchMedium(token, fixture.id, {
        status: 'inactive',
      }).expect(200);

      expect(toggled.body.status).toBe('inactive');

      const sameName = await patchMedium(token, fixture.id, {
        name: 'Renamed Fixture',
      }).expect(200);

      expect(sameName.body.name).toBe('Renamed Fixture');
    });

    it('rejects renaming to an existing name', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const duplicate = await patchMedium(token, fixture.id, {
        name: 'english',
      }).expect(409);

      expect(duplicate.body.message).toContain('already exists');
    });

    it('rejects invalid payloads and unknown mediums', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await patchMedium(token, fixture.id, { name: 'X' }).expect(400);
      await patchMedium(token, fixture.id, { status: 'archived' }).expect(400);
      await patchMedium(token, 'not-an-id', { name: 'Ghost Medium' }).expect(
        404,
      );
      await patchMedium(token, new Types.ObjectId().toString(), {
        name: 'Ghost Medium',
      }).expect(404);
    });
  });

  describe('delete', () => {
    it('soft deletes and hides the medium from the default list', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteMedium(token, fixture.id).expect(204);

      const hidden = await listMediums(token, {
        search: fixture.name,
      }).expect(200);

      expect(hidden.body.total).toBe(0);

      const included = await listMediums(token, {
        search: fixture.name,
        includeDeleted: 'true',
      }).expect(200);

      expect(included.body.total).toBe(1);
      expect(included.body.items[0]).toMatchObject({
        id: fixture.id,
        status: 'active',
      });
      expect(typeof included.body.items[0].deletedAt).toBe('string');

      await deleteMedium(token, fixture.id).expect(404);

      const raw = await mediumModel.findById(fixture.id).exec();

      expect(raw?.deletedAt).toBeInstanceOf(Date);
    });

    it('frees the name for reuse after deletion', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Reusable ${new Types.ObjectId().toString()}`;
      const response = await createMedium(token, { name }).expect(201);

      await deleteMedium(token, response.body.id as string).expect(204);
      await createMedium(token, { name }).expect(201);
    });

    it('rejects unknown mediums', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await deleteMedium(token, 'not-an-id').expect(404);
      await deleteMedium(token, new Types.ObjectId().toString()).expect(404);
    });
  });

  describe('restore', () => {
    it('restores a deleted medium', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteMedium(token, fixture.id).expect(204);

      const restored = await restoreMedium(token, fixture.id).expect(200);

      expect(restored.body).toMatchObject({
        id: fixture.id,
        name: fixture.name,
        deletedAt: null,
      });

      const visible = await listMediums(token, {
        search: fixture.name,
      }).expect(200);

      expect(visible.body.total).toBe(1);

      await restoreMedium(token, fixture.id).expect(404);
    });

    it('refuses to restore when the name was reused', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Conflict ${new Types.ObjectId().toString()}`;
      const first = await createMedium(token, { name }).expect(201);

      await deleteMedium(token, first.body.id as string).expect(204);
      await createMedium(token, { name }).expect(201);

      const conflict = await restoreMedium(
        token,
        first.body.id as string,
      ).expect(409);

      expect(conflict.body.message).toContain('already exists');
    });

    it('rejects unknown or live mediums', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await restoreMedium(token, 'not-an-id').expect(404);
      await restoreMedium(token, new Types.ObjectId().toString()).expect(404);
      await restoreMedium(token, fixture.id).expect(404);
    });
  });

  describe('tenant isolation', () => {
    it('keeps other tenants out of mediums', async () => {
      const greenwoodToken = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const rivertonToken = await appToken(RIVERTON_PRINCIPAL_EMAIL, PASSWORD);

      const rivertonList = await listMediums(rivertonToken).expect(200);

      expect(rivertonList.body.total).toBe(2);
      expect(
        (rivertonList.body.items as { name: string }[]).map(
          (item) => item.name,
        ),
      ).toEqual(['Kannada', 'Tamil']);

      const fixture = await createViaApi(greenwoodToken);

      await patchMedium(rivertonToken, fixture.id, {
        name: 'Stolen Medium',
      }).expect(404);
      await deleteMedium(rivertonToken, fixture.id).expect(404);
      await restoreMedium(rivertonToken, fixture.id).expect(404);

      const rivertonSearch = await listMediums(rivertonToken, {
        search: fixture.name,
        includeDeleted: 'true',
      }).expect(200);

      expect(rivertonSearch.body.total).toBe(0);
    });
  });
});
