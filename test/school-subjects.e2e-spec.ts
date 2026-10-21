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
import { Subject } from '../src/schemas/subject.schema.js';
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
let subjectModel: Model<Subject>;

let english: MediumDocument;
let hindi: MediumDocument;
let rivertonMedium: MediumDocument;

let standardOne: StandardDocument;
let standardTwo: StandardDocument;
let inactiveStandard: StandardDocument;
let deletedStandard: StandardDocument;

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

async function appToken(email: string, password: string): Promise<string> {
  const response = await login(email, password).expect(200);

  return response.body.accessToken as string;
}

function listSubjects(token: string, query: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .get('/api/subjects')
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

function createSubject(token: string, payload: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post('/api/subjects')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function patchSubject(
  token: string,
  id: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .patch(`/api/subjects/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function deleteSubject(token: string, id: string) {
  return request(app.getHttpServer())
    .delete(`/api/subjects/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

function restoreSubject(token: string, id: string) {
  return request(app.getHttpServer())
    .post(`/api/subjects/${id}/restore`)
    .set('Authorization', `Bearer ${token}`);
}

async function createViaApi(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const name = `Fixture ${new Types.ObjectId().toString()}`;
  const response = await createSubject(token, {
    name,
    standardId: standardOne._id.toString(),
    order: 90,
    ...overrides,
  }).expect(201);

  return { id: response.body.id as string, name: response.body.name as string };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-school-subjects-test');
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
  subjectModel = app.get<Model<Subject>>(getModelToken(Subject.name));

  const passwordHash = await passwordService.hash(PASSWORD);

  const greenwood = await tenantModel.create({
    name: 'Greenwood High',
    slug: 'greenwood-subjects',
    type: 'school',
    plan: 'growth',
    status: 'active',
  });
  const riverton = await tenantModel.create({
    name: 'Riverton School',
    slug: 'riverton-subjects',
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
  rivertonMedium = await mediumModel.create({
    tenantId: riverton._id,
    name: 'Kannada',
    nameKey: 'kannada',
    status: 'active',
    deletedAt: null,
  });

  standardOne = await standardModel.create({
    tenantId: greenwood._id,
    mediumId: english._id,
    name: 'Standard 1',
    nameKey: 'standard 1',
    order: 1,
    status: 'active',
    deletedAt: null,
  });
  standardTwo = await standardModel.create({
    tenantId: greenwood._id,
    mediumId: english._id,
    name: 'Standard 2',
    nameKey: 'standard 2',
    order: 2,
    status: 'active',
    deletedAt: null,
  });
  inactiveStandard = await standardModel.create({
    tenantId: greenwood._id,
    mediumId: hindi._id,
    name: 'Standard 1',
    nameKey: 'standard 1',
    order: 1,
    status: 'inactive',
    deletedAt: null,
  });
  deletedStandard = await standardModel.create({
    tenantId: greenwood._id,
    mediumId: english._id,
    name: 'Standard 3',
    nameKey: 'standard 3',
    order: 3,
    status: 'active',
    deletedAt: new Date(),
  });

  const rivertonStandard = await standardModel.create({
    tenantId: riverton._id,
    mediumId: rivertonMedium._id,
    name: 'Standard 1',
    nameKey: 'standard 1',
    order: 1,
    status: 'active',
    deletedAt: null,
  });

  await subjectModel.create([
    {
      tenantId: greenwood._id,
      standardId: standardOne._id,
      name: 'Mathematics',
      nameKey: 'mathematics',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      standardId: standardTwo._id,
      name: 'Science',
      nameKey: 'science',
      order: 2,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      standardId: inactiveStandard._id,
      name: 'History',
      nameKey: 'history',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      standardId: standardOne._id,
      name: 'Geography',
      nameKey: 'geography',
      order: 3,
      status: 'inactive',
      deletedAt: null,
    },
    {
      tenantId: riverton._id,
      standardId: rivertonStandard._id,
      name: 'General Knowledge',
      nameKey: 'general knowledge',
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

describe('School subjects (e2e)', () => {
  describe('access control', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer()).get('/api/subjects').expect(401);
      await request(app.getHttpServer())
        .post('/api/subjects')
        .send({
          name: 'No Token',
          standardId: standardOne._id.toString(),
          order: 1,
        })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/subjects/${new Types.ObjectId().toString()}`)
        .send({ name: 'No Token' })
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/subjects/${new Types.ObjectId().toString()}`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/subjects/${new Types.ObjectId().toString()}/restore`)
        .expect(401);
    });

    it('lets teachers read but not manage subjects', async () => {
      const teacherToken = await appToken(TEACHER_EMAIL, PASSWORD);

      const listed = await listSubjects(teacherToken).expect(200);

      expect(listed.body.total).toBe(4);

      const mathematics = await subjectModel
        .findOne({ name: 'Mathematics' })
        .exec();

      await createSubject(teacherToken, {
        name: 'Teacher Subject',
        standardId: standardOne._id.toString(),
        order: 5,
      }).expect(403);
      await patchSubject(teacherToken, mathematics?._id.toString() ?? '', {
        name: 'Teacher Edit',
      }).expect(403);
      await deleteSubject(
        teacherToken,
        mathematics?._id.toString() ?? '',
      ).expect(403);
      await restoreSubject(
        teacherToken,
        mathematics?._id.toString() ?? '',
      ).expect(403);
    });
  });

  describe('list', () => {
    it('returns seeded subjects with standard and medium names and a live summary', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await listSubjects(token).expect(200);

      expect(response.body.total).toBe(4);
      expect(response.body.summary).toEqual({
        active: 3,
        inactive: 1,
        deleted: 0,
      });

      const first = response.body.items[0] as Record<string, unknown>;

      expect(first).toMatchObject({
        name: 'Mathematics',
        standardId: standardOne._id.toString(),
        standardName: 'Standard 1',
        mediumId: english._id.toString(),
        mediumName: 'English',
        order: 1,
        status: 'active',
        deletedAt: null,
      });
      expect(typeof first['id']).toBe('string');
      expect(typeof first['createdAt']).toBe('string');
      expect(typeof first['updatedAt']).toBe('string');

      const names = (response.body.items as { name: string }[]).map(
        (item) => item.name,
      );

      expect(names).toEqual(['Mathematics', 'History', 'Science', 'Geography']);
    });

    it('filters by standard, status and search', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const byStandard = await listSubjects(token, {
        standardId: standardOne._id.toString(),
      }).expect(200);

      expect(byStandard.body.total).toBe(2);
      expect(
        (byStandard.body.items as { standardName: string }[]).every(
          (item) => item.standardName === 'Standard 1',
        ),
      ).toBe(true);

      const byStatus = await listSubjects(token, {
        status: 'inactive',
      }).expect(200);

      expect(byStatus.body.total).toBe(1);
      expect(byStatus.body.items[0].name).toBe('Geography');

      const bySearch = await listSubjects(token, {
        search: 'SCIENCE',
      }).expect(200);

      expect(bySearch.body.total).toBe(1);
      expect(bySearch.body.items[0].name).toBe('Science');

      const escaped = await listSubjects(token, { search: 'Sci*' }).expect(200);

      expect(escaped.body.total).toBe(0);

      const blankStandard = await listSubjects(token, {
        standardId: '',
      }).expect(200);

      expect(blankStandard.body.total).toBe(4);
    });

    it('sorts by order and rejects invalid queries', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const latest = await createViaApi(token, { order: 99 });

      const sorted = await listSubjects(token, {
        sort: 'order',
        dir: 'desc',
      }).expect(200);

      expect(sorted.body.items[0].id).toBe(latest.id);

      const byName = await listSubjects(token, {
        sort: 'name',
        dir: 'asc',
      }).expect(200);

      const names = (byName.body.items as { name: string }[]).map(
        (item) => item.name,
      );

      expect(names[0]).toBe(latest.name);
      expect(names.slice(1)).toEqual([
        'Geography',
        'History',
        'Mathematics',
        'Science',
      ]);

      await listSubjects(token, { standardId: 'not-an-id' }).expect(400);
      await listSubjects(token, { status: 'archived' }).expect(400);
      await listSubjects(token, { sort: 'email' }).expect(400);
      await listSubjects(token, { dir: 'sideways' }).expect(400);
      await listSubjects(token, { pageSize: 15 }).expect(400);
      await listSubjects(token, { page: 0 }).expect(400);
    });

    it('paginates through subjects', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const page = await listSubjects(token, {
        sort: 'order',
        dir: 'asc',
        pageSize: 10,
        page: 1,
      }).expect(200);

      expect(page.body.total).toBe(5);
      expect((page.body.items as unknown[]).length).toBe(5);
    });
  });

  describe('create', () => {
    it('creates a subject under an active standard and trims the name', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await createSubject(token, {
        name: '  English Literature  ',
        standardId: standardTwo._id.toString(),
        order: 10,
      }).expect(201);

      expect(response.body).toMatchObject({
        name: 'English Literature',
        standardId: standardTwo._id.toString(),
        standardName: 'Standard 2',
        mediumId: english._id.toString(),
        mediumName: 'English',
        order: 10,
        status: 'active',
        deletedAt: null,
      });
    });

    it('rejects duplicates per standard but allows the same name under another standard', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const duplicate = await createSubject(token, {
        name: 'science',
        standardId: standardTwo._id.toString(),
        order: 5,
      }).expect(409);

      expect(duplicate.body.message).toContain('already exists');

      await createSubject(token, {
        name: 'Science',
        standardId: standardOne._id.toString(),
        order: 11,
      }).expect(201);
    });

    it('rejects deleted, inactive and unknown standards plus invalid payloads', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const deleted = await createSubject(token, {
        name: 'Ghost Subject',
        standardId: deletedStandard._id.toString(),
        order: 1,
      }).expect(404);

      expect(deleted.body.message).toContain('Standard not found or inactive');

      const inactive = await createSubject(token, {
        name: 'Ghost Subject',
        standardId: inactiveStandard._id.toString(),
        order: 1,
      }).expect(404);

      expect(inactive.body.message).toContain('Standard not found or inactive');

      await createSubject(token, {
        name: 'Ghost Subject',
        standardId: new Types.ObjectId().toString(),
        order: 1,
      }).expect(404);
      await createSubject(token, {
        name: 'Bad Standard',
        standardId: 'not-an-id',
        order: 1,
      }).expect(400);
      await createSubject(token, {
        name: 'Bad Order',
        standardId: standardOne._id.toString(),
        order: 0,
      }).expect(400);
      await createSubject(token, {
        name: 'Bad Order',
        standardId: standardOne._id.toString(),
        order: 101,
      }).expect(400);
      await createSubject(token, {
        name: 'Bad Order',
        standardId: standardOne._id.toString(),
        order: 1.5,
      }).expect(400);
      await createSubject(token, {
        name: 'X',
        standardId: standardOne._id.toString(),
        order: 1,
      }).expect(400);
      await createSubject(token, {
        name: 'Bad Status',
        standardId: standardOne._id.toString(),
        order: 1,
        status: 'archived',
      }).expect(400);
      await createSubject(token, {
        name: 'Bad Field',
        standardId: standardOne._id.toString(),
        order: 1,
        unknown: true,
      }).expect(400);
    });
  });

  describe('update', () => {
    it('renames, reorders and moves a subject to another active standard', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const renamed = await patchSubject(token, fixture.id, {
        name: 'Renamed Subject',
        order: 7,
        status: 'inactive',
      }).expect(200);

      expect(renamed.body).toMatchObject({
        id: fixture.id,
        name: 'Renamed Subject',
        standardName: 'Standard 1',
        order: 7,
        status: 'inactive',
      });

      const moved = await patchSubject(token, fixture.id, {
        standardId: standardTwo._id.toString(),
      }).expect(200);

      expect(moved.body.standardId).toBe(standardTwo._id.toString());
      expect(moved.body.standardName).toBe('Standard 2');
      expect(moved.body.mediumName).toBe('English');
    });

    it('rejects duplicate names within the target standard on rename and move', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const rename = await patchSubject(token, fixture.id, {
        name: 'mathematics',
      }).expect(409);

      expect(rename.body.message).toContain('already exists');

      const move = await patchSubject(token, fixture.id, {
        standardId: standardTwo._id.toString(),
        name: 'Science',
      }).expect(409);

      expect(move.body.message).toContain('already exists');
    });

    it('rejects unknown subjects, standards and invalid payloads', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await patchSubject(token, fixture.id, { name: 'X' }).expect(400);
      await patchSubject(token, fixture.id, { order: 0 }).expect(400);
      await patchSubject(token, fixture.id, { status: 'archived' }).expect(400);
      await patchSubject(token, fixture.id, { standardId: 'not-an-id' }).expect(
        400,
      );
      await patchSubject(token, fixture.id, {
        standardId: new Types.ObjectId().toString(),
      }).expect(404);
      await patchSubject(token, fixture.id, {
        standardId: inactiveStandard._id.toString(),
      }).expect(404);
      await patchSubject(token, fixture.id, {
        standardId: deletedStandard._id.toString(),
      }).expect(404);
      await patchSubject(token, 'not-an-id', {
        name: 'Ghost Subject',
      }).expect(404);
      await patchSubject(token, new Types.ObjectId().toString(), {
        name: 'Ghost Subject',
      }).expect(404);
    });
  });

  describe('delete', () => {
    it('soft deletes and hides the subject from the default list', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteSubject(token, fixture.id).expect(204);

      const hidden = await listSubjects(token, {
        search: fixture.name,
      }).expect(200);

      expect(hidden.body.total).toBe(0);

      const included = await listSubjects(token, {
        search: fixture.name,
        includeDeleted: 'true',
      }).expect(200);

      expect(included.body.total).toBe(1);
      expect(typeof included.body.items[0].deletedAt).toBe('string');

      await deleteSubject(token, fixture.id).expect(404);

      const raw = await subjectModel.findById(fixture.id).exec();

      expect(raw?.deletedAt).toBeInstanceOf(Date);
    });

    it('frees the name for reuse within the same standard', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Reusable ${new Types.ObjectId().toString()}`;
      const response = await createSubject(token, {
        name,
        standardId: standardOne._id.toString(),
        order: 50,
      }).expect(201);

      await deleteSubject(token, response.body.id as string).expect(204);
      await createSubject(token, {
        name,
        standardId: standardOne._id.toString(),
        order: 50,
      }).expect(201);
    });

    it('rejects unknown subjects', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await deleteSubject(token, 'not-an-id').expect(404);
      await deleteSubject(token, new Types.ObjectId().toString()).expect(404);
    });
  });

  describe('restore', () => {
    it('restores a deleted subject', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteSubject(token, fixture.id).expect(204);

      const restored = await restoreSubject(token, fixture.id).expect(200);

      expect(restored.body).toMatchObject({
        id: fixture.id,
        name: fixture.name,
        standardName: 'Standard 1',
        deletedAt: null,
      });

      await restoreSubject(token, fixture.id).expect(404);
    });

    it('refuses to restore when the name was reused in the same standard', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Conflict ${new Types.ObjectId().toString()}`;
      const first = await createSubject(token, {
        name,
        standardId: standardOne._id.toString(),
        order: 60,
      }).expect(201);

      await deleteSubject(token, first.body.id as string).expect(204);
      await createSubject(token, {
        name,
        standardId: standardOne._id.toString(),
        order: 60,
      }).expect(201);

      const conflict = await restoreSubject(
        token,
        first.body.id as string,
      ).expect(409);

      expect(conflict.body.message).toContain('already exists');
    });

    it('rejects unknown or live subjects', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await restoreSubject(token, 'not-an-id').expect(404);
      await restoreSubject(token, new Types.ObjectId().toString()).expect(404);
      await restoreSubject(token, fixture.id).expect(404);
    });
  });

  describe('inactive and deleted standards', () => {
    it('keeps subjects visible when their standard is inactive or deleted but blocks new ones', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const inactiveList = await listSubjects(token, {
        standardId: inactiveStandard._id.toString(),
      }).expect(200);

      expect(inactiveList.body.total).toBe(1);
      expect(inactiveList.body.items[0].name).toBe('History');
      expect(inactiveList.body.items[0].standardName).toBe('Standard 1');
      expect(inactiveList.body.items[0].mediumName).toBe('Hindi');

      await createSubject(token, {
        name: 'New In Inactive',
        standardId: inactiveStandard._id.toString(),
        order: 2,
      }).expect(404);

      await standardModel
        .updateOne(
          { _id: standardTwo._id },
          { $set: { deletedAt: new Date() } },
        )
        .exec();

      const deletedList = await listSubjects(token, {
        standardId: standardTwo._id.toString(),
        search: 'Science',
      }).expect(200);

      expect(deletedList.body.total).toBe(1);
      expect(deletedList.body.items[0].name).toBe('Science');
      expect(deletedList.body.items[0].standardName).toBe('Standard 2');

      await createSubject(token, {
        name: 'New In Deleted',
        standardId: standardTwo._id.toString(),
        order: 3,
      }).expect(404);
    });
  });

  describe('tenant isolation', () => {
    it('keeps other tenants out of subjects', async () => {
      const greenwoodToken = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const rivertonToken = await appToken(RIVERTON_PRINCIPAL_EMAIL, PASSWORD);

      const rivertonList = await listSubjects(rivertonToken).expect(200);

      expect(rivertonList.body.total).toBe(1);
      expect(rivertonList.body.items[0].name).toBe('General Knowledge');
      expect(rivertonList.body.items[0].mediumName).toBe('Kannada');

      const fixture = await createViaApi(greenwoodToken);

      await patchSubject(rivertonToken, fixture.id, {
        name: 'Stolen Subject',
      }).expect(404);
      await deleteSubject(rivertonToken, fixture.id).expect(404);
      await restoreSubject(rivertonToken, fixture.id).expect(404);

      const crossStandard = await createSubject(rivertonToken, {
        name: 'Cross Standard',
        standardId: standardOne._id.toString(),
        order: 1,
      }).expect(404);

      expect(crossStandard.body.message).toContain(
        'Standard not found or inactive',
      );

      const crossList = await listSubjects(rivertonToken, {
        standardId: standardOne._id.toString(),
      }).expect(200);

      expect(crossList.body.total).toBe(0);
    });
  });
});
