import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { Medium, type MediumDocument } from '../src/schemas/medium.schema.js';
import {
  Standard,
  type StandardDocument,
} from '../src/schemas/standard.schema.js';
import { Tenant } from '../src/schemas/tenant.schema.js';
import { User } from '../src/schemas/user.schema.js';

const PASSWORD = 'School@12345';
const PRINCIPAL_EMAIL = 'principal@greenwood.test';
const TEACHER_EMAIL = 'teacher@greenwood.test';
const RIVERTON_PRINCIPAL_EMAIL = 'principal@riverton.test';

let app: INestApplication;
let mongo: MongoMemoryServer;
let mediumModel: Model<Medium>;
let standardModel: Model<Standard>;

let english: MediumDocument;
let hindi: MediumDocument;
let marathi: MediumDocument;
let rivertonMedium: MediumDocument;

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

async function appToken(email: string, password: string): Promise<string> {
  const response = await login(email, password).expect(200);

  return response.body.accessToken as string;
}

function listStandards(token: string, query: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .get('/api/standards')
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

function createStandard(token: string, payload: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post('/api/standards')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function patchStandard(
  token: string,
  id: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .patch(`/api/standards/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function deleteStandard(token: string, id: string) {
  return request(app.getHttpServer())
    .delete(`/api/standards/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

function restoreStandard(token: string, id: string) {
  return request(app.getHttpServer())
    .post(`/api/standards/${id}/restore`)
    .set('Authorization', `Bearer ${token}`);
}

async function findStandard(name: string): Promise<StandardDocument> {
  const standard = await standardModel.findOne({ name }).exec();

  if (!standard) {
    throw new Error(`Seeded standard ${name} was not found.`);
  }

  return standard;
}

async function createViaApi(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const name = `Fixture ${new Types.ObjectId().toString()}`;
  const response = await createStandard(token, {
    name,
    mediumId: english._id.toString(),
    order: 90,
    ...overrides,
  }).expect(201);

  return { id: response.body.id as string, name: response.body.name as string };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-school-standards-test');
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
  standardModel = app.get<Model<Standard>>(getModelToken(Standard.name));

  const passwordHash = await passwordService.hash(PASSWORD);

  const greenwood = await tenantModel.create({
    name: 'Greenwood High',
    slug: 'greenwood-standards',
    type: 'school',
    plan: 'growth',
    status: 'active',
  });
  const riverton = await tenantModel.create({
    name: 'Riverton School',
    slug: 'riverton-standards',
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

  english = await mediumModel.create({
    tenantId: greenwood._id,
    name: 'English',
    nameKey: 'english',
    status: 'active',
    deletedAt: null,
  });
  hindi = await mediumModel.create({
    tenantId: greenwood._id,
    name: 'Hindi',
    nameKey: 'hindi',
    status: 'active',
    deletedAt: null,
  });
  marathi = await mediumModel.create({
    tenantId: greenwood._id,
    name: 'Marathi',
    nameKey: 'marathi',
    status: 'active',
    deletedAt: null,
  });
  rivertonMedium = await mediumModel.create({
    tenantId: riverton._id,
    name: 'Kannada',
    nameKey: 'kannada',
    status: 'active',
    deletedAt: null,
  });

  await standardModel.create([
    {
      tenantId: greenwood._id,
      mediumId: english._id,
      name: 'Standard 1',
      nameKey: 'standard 1',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      mediumId: english._id,
      name: 'Standard 2',
      nameKey: 'standard 2',
      order: 2,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      mediumId: hindi._id,
      name: 'Standard 1',
      nameKey: 'standard 1',
      order: 1,
      status: 'inactive',
      deletedAt: null,
    },
    {
      tenantId: riverton._id,
      mediumId: rivertonMedium._id,
      name: 'Standard 1',
      nameKey: 'standard 1',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
  ]);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

describe('School standards (e2e)', () => {
  describe('access control', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer()).get('/api/standards').expect(401);
      await request(app.getHttpServer())
        .post('/api/standards')
        .send({ name: 'No Token', mediumId: english._id.toString(), order: 1 })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/standards/${new Types.ObjectId().toString()}`)
        .send({ name: 'No Token' })
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/standards/${new Types.ObjectId().toString()}`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/standards/${new Types.ObjectId().toString()}/restore`)
        .expect(401);
    });

    it('lets teachers read but not manage standards', async () => {
      const teacherToken = await appToken(TEACHER_EMAIL, PASSWORD);

      const listed = await listStandards(teacherToken).expect(200);

      expect(listed.body.total).toBe(3);

      const standard = await findStandard('Standard 2');

      await createStandard(teacherToken, {
        name: 'Teacher Standard',
        mediumId: english._id.toString(),
        order: 5,
      }).expect(403);
      await patchStandard(teacherToken, standard._id.toString(), {
        name: 'Teacher Edit',
      }).expect(403);
      await deleteStandard(teacherToken, standard._id.toString()).expect(403);
      await restoreStandard(teacherToken, standard._id.toString()).expect(403);
    });
  });

  describe('list', () => {
    it('returns seeded standards with medium names and a live summary', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await listStandards(token).expect(200);

      expect(response.body.total).toBe(3);
      expect(response.body.summary).toEqual({
        active: 2,
        inactive: 1,
        deleted: 0,
      });

      const first = response.body.items[0] as Record<string, unknown>;

      expect(first).toMatchObject({
        name: 'Standard 1',
        mediumId: english._id.toString(),
        mediumName: 'English',
        order: 1,
        status: 'active',
        deletedAt: null,
      });
      expect(typeof first['id']).toBe('string');
      expect(typeof first['createdAt']).toBe('string');
      expect(typeof first['updatedAt']).toBe('string');

      const names = (response.body.items as { mediumName: string }[]).map(
        (item) => item.mediumName,
      );

      expect(names).toEqual(['English', 'Hindi', 'English']);
    });

    it('filters by medium, status and search', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const byMedium = await listStandards(token, {
        mediumId: english._id.toString(),
      }).expect(200);

      expect(byMedium.body.total).toBe(2);
      expect(
        (byMedium.body.items as { mediumName: string }[]).every(
          (item) => item.mediumName === 'English',
        ),
      ).toBe(true);

      const byStatus = await listStandards(token, {
        status: 'inactive',
      }).expect(200);

      expect(byStatus.body.total).toBe(1);
      expect(byStatus.body.items[0].mediumName).toBe('Hindi');

      const bySearch = await listStandards(token, {
        search: 'STANDARD 2',
      }).expect(200);

      expect(bySearch.body.total).toBe(1);
      expect(bySearch.body.items[0].name).toBe('Standard 2');

      const escaped = await listStandards(token, { search: 'Stand*' }).expect(
        200,
      );

      expect(escaped.body.total).toBe(0);

      const blankMedium = await listStandards(token, { mediumId: '' }).expect(
        200,
      );

      expect(blankMedium.body.total).toBe(3);
    });

    it('sorts by order and rejects invalid queries', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const latest = await createViaApi(token, { order: 99 });

      const sorted = await listStandards(token, {
        sort: 'order',
        dir: 'desc',
      }).expect(200);

      expect(sorted.body.items[0].id).toBe(latest.id);

      const byName = await listStandards(token, {
        sort: 'name',
        dir: 'asc',
      }).expect(200);

      const names = (byName.body.items as { name: string }[]).map(
        (item) => item.name,
      );

      expect(names[0]).toBe(latest.name);
      expect(names.slice(1)).toEqual([
        'Standard 1',
        'Standard 1',
        'Standard 2',
      ]);

      await listStandards(token, { mediumId: 'not-an-id' }).expect(400);
      await listStandards(token, { status: 'archived' }).expect(400);
      await listStandards(token, { sort: 'email' }).expect(400);
      await listStandards(token, { dir: 'sideways' }).expect(400);
      await listStandards(token, { pageSize: 15 }).expect(400);
      await listStandards(token, { page: 0 }).expect(400);
    });

    it('paginates through standards', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const page = await listStandards(token, {
        sort: 'order',
        dir: 'asc',
        pageSize: 10,
        page: 1,
      }).expect(200);

      expect(page.body.total).toBe(4);
      expect((page.body.items as unknown[]).length).toBe(4);
    });
  });

  describe('create', () => {
    it('creates a standard and trims the name', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await createStandard(token, {
        name: '  Standard 10  ',
        mediumId: marathi._id.toString(),
        order: 10,
      }).expect(201);

      expect(response.body).toMatchObject({
        name: 'Standard 10',
        mediumId: marathi._id.toString(),
        mediumName: 'Marathi',
        order: 10,
        status: 'active',
        deletedAt: null,
      });
    });

    it('allows the same name in different mediums but rejects duplicates per medium', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const duplicate = await createStandard(token, {
        name: 'standard 1',
        mediumId: english._id.toString(),
        order: 5,
      }).expect(409);

      expect(duplicate.body.message).toContain('already exists');

      await createStandard(token, {
        name: 'Standard 9',
        mediumId: english._id.toString(),
        order: 9,
      }).expect(201);
    });

    it('rejects unknown mediums and invalid payloads', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const unknownMedium = await createStandard(token, {
        name: 'Ghost Standard',
        mediumId: new Types.ObjectId().toString(),
        order: 1,
      }).expect(404);

      expect(unknownMedium.body.message).toContain('Medium not found');

      await createStandard(token, {
        name: 'Bad Medium',
        mediumId: 'not-an-id',
        order: 1,
      }).expect(400);
      await createStandard(token, {
        name: 'Bad Order',
        mediumId: english._id.toString(),
        order: 0,
      }).expect(400);
      await createStandard(token, {
        name: 'Bad Order',
        mediumId: english._id.toString(),
        order: 101,
      }).expect(400);
      await createStandard(token, {
        name: 'Bad Order',
        mediumId: english._id.toString(),
        order: 1.5,
      }).expect(400);
      await createStandard(token, {
        name: 'X',
        mediumId: english._id.toString(),
        order: 1,
      }).expect(400);
      await createStandard(token, {
        name: 'Bad Status',
        mediumId: english._id.toString(),
        order: 1,
        status: 'archived',
      }).expect(400);
      await createStandard(token, {
        name: 'Bad Field',
        mediumId: english._id.toString(),
        order: 1,
        unknown: true,
      }).expect(400);
    });
  });

  describe('update', () => {
    it('renames, reorders and moves a standard to another medium', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const renamed = await patchStandard(token, fixture.id, {
        name: 'Renamed Standard',
        order: 7,
        status: 'inactive',
      }).expect(200);

      expect(renamed.body).toMatchObject({
        id: fixture.id,
        name: 'Renamed Standard',
        mediumName: 'English',
        order: 7,
        status: 'inactive',
      });

      const moved = await patchStandard(token, fixture.id, {
        mediumId: hindi._id.toString(),
      }).expect(200);

      expect(moved.body.mediumId).toBe(hindi._id.toString());
      expect(moved.body.mediumName).toBe('Hindi');
    });

    it('rejects duplicate names within the target medium on rename and move', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const rename = await patchStandard(token, fixture.id, {
        name: 'standard 2',
      }).expect(409);

      expect(rename.body.message).toContain('already exists');

      const move = await patchStandard(token, fixture.id, {
        mediumId: hindi._id.toString(),
        name: 'Standard 1',
      }).expect(409);

      expect(move.body.message).toContain('already exists');
    });

    it('rejects unknown standards, mediums and invalid payloads', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await patchStandard(token, fixture.id, { name: 'X' }).expect(400);
      await patchStandard(token, fixture.id, { order: 0 }).expect(400);
      await patchStandard(token, fixture.id, { status: 'archived' }).expect(
        400,
      );
      await patchStandard(token, fixture.id, {
        mediumId: 'not-an-id',
      }).expect(400);
      await patchStandard(token, fixture.id, {
        mediumId: new Types.ObjectId().toString(),
      }).expect(404);
      await patchStandard(token, 'not-an-id', {
        name: 'Ghost Standard',
      }).expect(404);
      await patchStandard(token, new Types.ObjectId().toString(), {
        name: 'Ghost Standard',
      }).expect(404);
    });
  });

  describe('delete', () => {
    it('soft deletes and hides the standard from the default list', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteStandard(token, fixture.id).expect(204);

      const hidden = await listStandards(token, {
        search: fixture.name,
      }).expect(200);

      expect(hidden.body.total).toBe(0);

      const included = await listStandards(token, {
        search: fixture.name,
        includeDeleted: 'true',
      }).expect(200);

      expect(included.body.total).toBe(1);
      expect(typeof included.body.items[0].deletedAt).toBe('string');

      await deleteStandard(token, fixture.id).expect(404);

      const raw = await standardModel.findById(fixture.id).exec();

      expect(raw?.deletedAt).toBeInstanceOf(Date);
    });

    it('frees the name for reuse within the same medium', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Reusable ${new Types.ObjectId().toString()}`;
      const response = await createStandard(token, {
        name,
        mediumId: english._id.toString(),
        order: 50,
      }).expect(201);

      await deleteStandard(token, response.body.id as string).expect(204);
      await createStandard(token, {
        name,
        mediumId: english._id.toString(),
        order: 50,
      }).expect(201);
    });

    it('rejects unknown standards', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await deleteStandard(token, 'not-an-id').expect(404);
      await deleteStandard(token, new Types.ObjectId().toString()).expect(404);
    });
  });

  describe('restore', () => {
    it('restores a deleted standard', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteStandard(token, fixture.id).expect(204);

      const restored = await restoreStandard(token, fixture.id).expect(200);

      expect(restored.body).toMatchObject({
        id: fixture.id,
        name: fixture.name,
        mediumName: 'English',
        deletedAt: null,
      });

      await restoreStandard(token, fixture.id).expect(404);
    });

    it('refuses to restore when the name was reused in the same medium', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Conflict ${new Types.ObjectId().toString()}`;
      const first = await createStandard(token, {
        name,
        mediumId: english._id.toString(),
        order: 60,
      }).expect(201);

      await deleteStandard(token, first.body.id as string).expect(204);
      await createStandard(token, {
        name,
        mediumId: english._id.toString(),
        order: 60,
      }).expect(201);

      const conflict = await restoreStandard(
        token,
        first.body.id as string,
      ).expect(409);

      expect(conflict.body.message).toContain('already exists');
    });

    it('rejects unknown or live standards', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await restoreStandard(token, 'not-an-id').expect(404);
      await restoreStandard(token, new Types.ObjectId().toString()).expect(404);
      await restoreStandard(token, fixture.id).expect(404);
    });
  });

  describe('deleted mediums', () => {
    it('keeps standards visible when their medium is deleted but blocks new ones', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await mediumModel
        .updateOne({ _id: marathi._id }, { $set: { deletedAt: new Date() } })
        .exec();

      const listed = await listStandards(token, {
        mediumId: marathi._id.toString(),
      }).expect(200);

      expect(listed.body.total).toBe(1);
      expect(listed.body.items[0].name).toBe('Standard 10');
      expect(listed.body.items[0].mediumName).toBe('Marathi');

      await createStandard(token, {
        name: 'New In Marathi',
        mediumId: marathi._id.toString(),
        order: 11,
      }).expect(404);
    });
  });

  describe('tenant isolation', () => {
    it('keeps other tenants out of standards', async () => {
      const greenwoodToken = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const rivertonToken = await appToken(RIVERTON_PRINCIPAL_EMAIL, PASSWORD);

      const rivertonList = await listStandards(rivertonToken).expect(200);

      expect(rivertonList.body.total).toBe(1);
      expect(rivertonList.body.items[0].mediumName).toBe('Kannada');

      const fixture = await createViaApi(greenwoodToken);

      await patchStandard(rivertonToken, fixture.id, {
        name: 'Stolen Standard',
      }).expect(404);
      await deleteStandard(rivertonToken, fixture.id).expect(404);
      await restoreStandard(rivertonToken, fixture.id).expect(404);

      const crossMedium = await createStandard(rivertonToken, {
        name: 'Cross Medium',
        mediumId: english._id.toString(),
        order: 1,
      }).expect(404);

      expect(crossMedium.body.message).toContain('Medium not found');

      const crossList = await listStandards(rivertonToken, {
        mediumId: english._id.toString(),
      }).expect(200);

      expect(crossList.body.total).toBe(0);
    });
  });
});
