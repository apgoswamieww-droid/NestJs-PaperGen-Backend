import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { Chapter } from '../src/schemas/chapter.schema.js';
import { Medium, type MediumDocument } from '../src/schemas/medium.schema.js';
import {
  Standard,
  type StandardDocument,
} from '../src/schemas/standard.schema.js';
import {
  Subject,
  type SubjectDocument,
} from '../src/schemas/subject.schema.js';
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
let chapterModel: Model<Chapter>;

let english: MediumDocument;
let hindi: MediumDocument;
let rivertonMedium: MediumDocument;

let standardOne: StandardDocument;
let standardTwo: StandardDocument;
let inactiveStandard: StandardDocument;

let subjectOne: SubjectDocument;
let subjectTwo: SubjectDocument;
let subjectThree: SubjectDocument;
let inactiveSubject: SubjectDocument;
let deletedSubject: SubjectDocument;

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

async function appToken(email: string, password: string): Promise<string> {
  const response = await login(email, password).expect(200);

  return response.body.accessToken as string;
}

function listChapters(token: string, query: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .get('/api/chapters')
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

function createChapter(token: string, payload: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post('/api/chapters')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function patchChapter(
  token: string,
  id: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .patch(`/api/chapters/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function deleteChapter(token: string, id: string) {
  return request(app.getHttpServer())
    .delete(`/api/chapters/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

function restoreChapter(token: string, id: string) {
  return request(app.getHttpServer())
    .post(`/api/chapters/${id}/restore`)
    .set('Authorization', `Bearer ${token}`);
}

async function createViaApi(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const name = `Fixture ${new Types.ObjectId().toString()}`;
  const response = await createChapter(token, {
    name,
    subjectId: subjectOne._id.toString(),
    referenceType: 'ncert',
    order: 90,
    ...overrides,
  }).expect(201);

  return { id: response.body.id as string, name: response.body.name as string };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-school-chapters-test');
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
  chapterModel = app.get<Model<Chapter>>(getModelToken(Chapter.name));

  const passwordHash = await passwordService.hash(PASSWORD);

  const greenwood = await tenantModel.create({
    name: 'Greenwood High',
    slug: 'greenwood-chapters',
    type: 'school',
    plan: 'growth',
    status: 'active',
  });
  const riverton = await tenantModel.create({
    name: 'Riverton School',
    slug: 'riverton-chapters',
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

  const rivertonStandard = await standardModel.create({
    tenantId: riverton._id,
    mediumId: rivertonMedium._id,
    name: 'Standard 1',
    nameKey: 'standard 1',
    order: 1,
    status: 'active',
    deletedAt: null,
  });

  subjectOne = await subjectModel.create({
    tenantId: greenwood._id,
    standardId: standardOne._id,
    name: 'Mathematics',
    nameKey: 'mathematics',
    order: 1,
    status: 'active',
    deletedAt: null,
  });
  subjectTwo = await subjectModel.create({
    tenantId: greenwood._id,
    standardId: standardTwo._id,
    name: 'Science',
    nameKey: 'science',
    order: 2,
    status: 'active',
    deletedAt: null,
  });
  subjectThree = await subjectModel.create({
    tenantId: greenwood._id,
    standardId: inactiveStandard._id,
    name: 'Computers',
    nameKey: 'computers',
    order: 3,
    status: 'active',
    deletedAt: null,
  });
  inactiveSubject = await subjectModel.create({
    tenantId: greenwood._id,
    standardId: standardOne._id,
    name: 'History',
    nameKey: 'history',
    order: 4,
    status: 'inactive',
    deletedAt: null,
  });
  deletedSubject = await subjectModel.create({
    tenantId: greenwood._id,
    standardId: standardOne._id,
    name: 'Geography',
    nameKey: 'geography',
    order: 5,
    status: 'active',
    deletedAt: new Date(),
  });

  const rivertonSubject = await subjectModel.create({
    tenantId: riverton._id,
    standardId: rivertonStandard._id,
    name: 'General Knowledge',
    nameKey: 'general knowledge',
    order: 1,
    status: 'active',
    deletedAt: null,
  });

  await chapterModel.create([
    {
      tenantId: greenwood._id,
      subjectId: subjectOne._id,
      name: 'Number System',
      nameKey: 'number system',
      referenceType: 'ncert',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      subjectId: subjectOne._id,
      name: 'Algebra Basics',
      nameKey: 'algebra basics',
      referenceType: 'other',
      order: 2,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      subjectId: subjectTwo._id,
      name: 'Living World',
      nameKey: 'living world',
      referenceType: 'ncert',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      subjectId: subjectOne._id,
      name: 'Geometry Basics',
      nameKey: 'geometry basics',
      referenceType: 'ncert',
      order: 3,
      status: 'inactive',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      subjectId: subjectThree._id,
      name: 'Computer Basics',
      nameKey: 'computer basics',
      referenceType: 'ncert',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: riverton._id,
      subjectId: rivertonSubject._id,
      name: 'Riverton Chapter',
      nameKey: 'riverton chapter',
      referenceType: 'ncert',
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

describe('School chapters (e2e)', () => {
  describe('access control', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer()).get('/api/chapters').expect(401);
      await request(app.getHttpServer())
        .post('/api/chapters')
        .send({
          name: 'No Token',
          subjectId: subjectOne._id.toString(),
          referenceType: 'ncert',
          order: 1,
        })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/chapters/${new Types.ObjectId().toString()}`)
        .send({ name: 'No Token' })
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/chapters/${new Types.ObjectId().toString()}`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/chapters/${new Types.ObjectId().toString()}/restore`)
        .expect(401);
    });

    it('lets teachers read but not manage chapters', async () => {
      const teacherToken = await appToken(TEACHER_EMAIL, PASSWORD);
      const chapter = await chapterModel.findOne({ name: 'Algebra Basics' });

      const listed = await listChapters(teacherToken).expect(200);

      expect(listed.body.total).toBe(5);

      await createChapter(teacherToken, {
        name: 'Teacher Chapter',
        subjectId: subjectOne._id.toString(),
        referenceType: 'ncert',
        order: 5,
      }).expect(403);
      await patchChapter(teacherToken, chapter?._id.toString() ?? '', {
        name: 'Teacher Edit',
      }).expect(403);
      await deleteChapter(teacherToken, chapter?._id.toString() ?? '').expect(
        403,
      );
      await restoreChapter(teacherToken, chapter?._id.toString() ?? '').expect(
        403,
      );
    });
  });

  describe('list', () => {
    it('returns seeded chapters with subject lineage and a live summary', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await listChapters(token).expect(200);

      expect(response.body.total).toBe(5);
      expect(response.body.summary).toEqual({
        active: 4,
        inactive: 1,
        deleted: 0,
      });

      const first = response.body.items[0] as Record<string, unknown>;

      expect(first).toMatchObject({
        name: 'Number System',
        subjectId: subjectOne._id.toString(),
        subjectName: 'Mathematics',
        standardId: standardOne._id.toString(),
        standardName: 'Standard 1',
        mediumId: english._id.toString(),
        mediumName: 'English',
        referenceType: 'ncert',
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

      expect(names).toEqual([
        'Number System',
        'Living World',
        'Computer Basics',
        'Algebra Basics',
        'Geometry Basics',
      ]);
    });

    it('filters by subject, reference type, status and search', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const bySubject = await listChapters(token, {
        subjectId: subjectOne._id.toString(),
      }).expect(200);

      expect(bySubject.body.total).toBe(3);
      expect(
        (bySubject.body.items as { subjectName: string }[]).every(
          (item) => item.subjectName === 'Mathematics',
        ),
      ).toBe(true);

      const byReference = await listChapters(token, {
        referenceType: 'other',
      }).expect(200);

      expect(byReference.body.total).toBe(1);
      expect(byReference.body.items[0].name).toBe('Algebra Basics');

      const byStatus = await listChapters(token, {
        status: 'inactive',
      }).expect(200);

      expect(byStatus.body.total).toBe(1);
      expect(byStatus.body.items[0].name).toBe('Geometry Basics');

      const bySearch = await listChapters(token, {
        search: 'ALGEBRA',
      }).expect(200);

      expect(bySearch.body.total).toBe(1);
      expect(bySearch.body.items[0].name).toBe('Algebra Basics');

      const escaped = await listChapters(token, {
        search: 'Algebra*',
      }).expect(200);

      expect(escaped.body.total).toBe(0);

      const blankSubject = await listChapters(token, {
        subjectId: '',
      }).expect(200);

      expect(blankSubject.body.total).toBe(5);
    });

    it('sorts by order and rejects invalid queries', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const latest = await createViaApi(token, { order: 99 });

      const sorted = await listChapters(token, {
        sort: 'order',
        dir: 'desc',
      }).expect(200);

      expect(sorted.body.items[0].id).toBe(latest.id);

      const byName = await listChapters(token, {
        sort: 'name',
        dir: 'asc',
      }).expect(200);

      const names = (byName.body.items as { name: string }[]).map(
        (item) => item.name,
      );

      expect(names).toEqual([
        'Algebra Basics',
        'Computer Basics',
        latest.name,
        'Geometry Basics',
        'Living World',
        'Number System',
      ]);

      await listChapters(token, { subjectId: 'not-an-id' }).expect(400);
      await listChapters(token, { referenceType: 'icse' }).expect(400);
      await listChapters(token, { status: 'archived' }).expect(400);
      await listChapters(token, { sort: 'email' }).expect(400);
      await listChapters(token, { dir: 'sideways' }).expect(400);
      await listChapters(token, { pageSize: 15 }).expect(400);
      await listChapters(token, { page: 0 }).expect(400);
    });

    it('paginates through chapters', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const page = await listChapters(token, {
        sort: 'order',
        dir: 'asc',
        pageSize: 10,
        page: 1,
      }).expect(200);

      expect(page.body.total).toBe(6);
      expect((page.body.items as unknown[]).length).toBe(6);
    });
  });

  describe('create', () => {
    it('creates a chapter under an active subject and trims the name', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await createChapter(token, {
        name: '  World History  ',
        subjectId: subjectTwo._id.toString(),
        referenceType: 'other',
        order: 10,
      }).expect(201);

      expect(response.body).toMatchObject({
        name: 'World History',
        subjectId: subjectTwo._id.toString(),
        subjectName: 'Science',
        standardId: standardTwo._id.toString(),
        standardName: 'Standard 2',
        mediumId: english._id.toString(),
        mediumName: 'English',
        referenceType: 'other',
        order: 10,
        status: 'active',
        deletedAt: null,
      });
    });

    it('rejects duplicates per subject but allows the same name under another subject', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const duplicate = await createChapter(token, {
        name: 'algebra basics',
        subjectId: subjectOne._id.toString(),
        referenceType: 'ncert',
        order: 5,
      }).expect(409);

      expect(duplicate.body.message).toContain('already exists');

      await createChapter(token, {
        name: 'Algebra Basics',
        subjectId: subjectTwo._id.toString(),
        referenceType: 'ncert',
        order: 11,
      }).expect(201);
    });

    it('rejects deleted, inactive and unknown subjects plus invalid payloads', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const deleted = await createChapter(token, {
        name: 'Ghost Chapter',
        subjectId: deletedSubject._id.toString(),
        referenceType: 'ncert',
        order: 1,
      }).expect(404);

      expect(deleted.body.message).toContain('Subject not found or inactive');

      const inactive = await createChapter(token, {
        name: 'Ghost Chapter',
        subjectId: inactiveSubject._id.toString(),
        referenceType: 'ncert',
        order: 1,
      }).expect(404);

      expect(inactive.body.message).toContain('Subject not found or inactive');

      await createChapter(token, {
        name: 'Ghost Chapter',
        subjectId: new Types.ObjectId().toString(),
        referenceType: 'ncert',
        order: 1,
      }).expect(404);
      await createChapter(token, {
        name: 'Bad Subject',
        subjectId: 'not-an-id',
        referenceType: 'ncert',
        order: 1,
      }).expect(400);
      await createChapter(token, {
        name: 'Bad Order',
        subjectId: subjectOne._id.toString(),
        referenceType: 'ncert',
        order: 0,
      }).expect(400);
      await createChapter(token, {
        name: 'Bad Order',
        subjectId: subjectOne._id.toString(),
        referenceType: 'ncert',
        order: 101,
      }).expect(400);
      await createChapter(token, {
        name: 'Bad Order',
        subjectId: subjectOne._id.toString(),
        referenceType: 'ncert',
        order: 1.5,
      }).expect(400);
      await createChapter(token, {
        name: 'X',
        subjectId: subjectOne._id.toString(),
        referenceType: 'ncert',
        order: 1,
      }).expect(400);
      await createChapter(token, {
        name: 'Bad Status',
        subjectId: subjectOne._id.toString(),
        referenceType: 'ncert',
        order: 1,
        status: 'archived',
      }).expect(400);
      await createChapter(token, {
        name: 'Bad Reference',
        subjectId: subjectOne._id.toString(),
        referenceType: 'icse',
        order: 1,
      }).expect(400);
      await createChapter(token, {
        name: 'Missing Reference',
        subjectId: subjectOne._id.toString(),
        order: 1,
      }).expect(400);
      await createChapter(token, {
        name: 'Bad Field',
        subjectId: subjectOne._id.toString(),
        referenceType: 'ncert',
        order: 1,
        unknown: true,
      }).expect(400);
    });
  });

  describe('update', () => {
    it('renames, reorders, retypes and moves a chapter to another active subject', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const renamed = await patchChapter(token, fixture.id, {
        name: 'Advanced Number Theory',
        order: 7,
        status: 'inactive',
        referenceType: 'other',
      }).expect(200);

      expect(renamed.body).toMatchObject({
        id: fixture.id,
        name: 'Advanced Number Theory',
        subjectName: 'Mathematics',
        referenceType: 'other',
        order: 7,
        status: 'inactive',
      });

      const moved = await patchChapter(token, fixture.id, {
        subjectId: subjectTwo._id.toString(),
      }).expect(200);

      expect(moved.body.subjectId).toBe(subjectTwo._id.toString());
      expect(moved.body.subjectName).toBe('Science');
      expect(moved.body.standardName).toBe('Standard 2');
      expect(moved.body.mediumName).toBe('English');
    });

    it('rejects duplicate names within the target subject on rename and move', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const rename = await patchChapter(token, fixture.id, {
        name: 'algebra basics',
      }).expect(409);

      expect(rename.body.message).toContain('already exists');

      const move = await patchChapter(token, fixture.id, {
        subjectId: subjectTwo._id.toString(),
        name: 'Living World',
      }).expect(409);

      expect(move.body.message).toContain('already exists');
    });

    it('rejects unknown chapters, subjects and invalid payloads', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await patchChapter(token, fixture.id, { name: 'X' }).expect(400);
      await patchChapter(token, fixture.id, { order: 0 }).expect(400);
      await patchChapter(token, fixture.id, { status: 'archived' }).expect(400);
      await patchChapter(token, fixture.id, { referenceType: 'icse' }).expect(
        400,
      );
      await patchChapter(token, fixture.id, { subjectId: 'not-an-id' }).expect(
        400,
      );
      await patchChapter(token, fixture.id, {
        subjectId: new Types.ObjectId().toString(),
      }).expect(404);
      await patchChapter(token, fixture.id, {
        subjectId: inactiveSubject._id.toString(),
      }).expect(404);
      await patchChapter(token, fixture.id, {
        subjectId: deletedSubject._id.toString(),
      }).expect(404);
      await patchChapter(token, 'not-an-id', {
        name: 'Ghost Chapter',
      }).expect(404);
      await patchChapter(token, new Types.ObjectId().toString(), {
        name: 'Ghost Chapter',
      }).expect(404);
    });
  });

  describe('delete', () => {
    it('soft deletes and hides the chapter from the default list', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteChapter(token, fixture.id).expect(204);

      const hidden = await listChapters(token, {
        search: fixture.name,
      }).expect(200);

      expect(hidden.body.total).toBe(0);

      const included = await listChapters(token, {
        search: fixture.name,
        includeDeleted: 'true',
      }).expect(200);

      expect(included.body.total).toBe(1);
      expect(typeof included.body.items[0].deletedAt).toBe('string');

      await deleteChapter(token, fixture.id).expect(404);

      const raw = await chapterModel.findById(fixture.id).exec();

      expect(raw?.deletedAt).toBeInstanceOf(Date);
    });

    it('frees the name for reuse within the same subject', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Reusable ${new Types.ObjectId().toString()}`;
      const response = await createChapter(token, {
        name,
        subjectId: subjectOne._id.toString(),
        referenceType: 'ncert',
        order: 50,
      }).expect(201);

      await deleteChapter(token, response.body.id as string).expect(204);
      await createChapter(token, {
        name,
        subjectId: subjectOne._id.toString(),
        referenceType: 'ncert',
        order: 50,
      }).expect(201);
    });

    it('rejects unknown chapters', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await deleteChapter(token, 'not-an-id').expect(404);
      await deleteChapter(token, new Types.ObjectId().toString()).expect(404);
    });
  });

  describe('restore', () => {
    it('restores a deleted chapter', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteChapter(token, fixture.id).expect(204);

      const restored = await restoreChapter(token, fixture.id).expect(200);

      expect(restored.body).toMatchObject({
        id: fixture.id,
        name: fixture.name,
        subjectName: 'Mathematics',
        deletedAt: null,
      });

      await restoreChapter(token, fixture.id).expect(404);
    });

    it('refuses to restore when the name was reused in the same subject', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Conflict ${new Types.ObjectId().toString()}`;
      const first = await createChapter(token, {
        name,
        subjectId: subjectOne._id.toString(),
        referenceType: 'ncert',
        order: 60,
      }).expect(201);

      await deleteChapter(token, first.body.id as string).expect(204);
      await createChapter(token, {
        name,
        subjectId: subjectOne._id.toString(),
        referenceType: 'ncert',
        order: 60,
      }).expect(201);

      const conflict = await restoreChapter(
        token,
        first.body.id as string,
      ).expect(409);

      expect(conflict.body.message).toContain('already exists');
    });

    it('rejects unknown or live chapters', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await restoreChapter(token, 'not-an-id').expect(404);
      await restoreChapter(token, new Types.ObjectId().toString()).expect(404);
      await restoreChapter(token, fixture.id).expect(404);
    });
  });

  describe('inactive and deleted subjects', () => {
    it('keeps chapters visible when their subject is inactive or deleted but blocks new ones', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await subjectModel
        .updateOne({ _id: subjectThree._id }, { $set: { status: 'inactive' } })
        .exec();

      const inactiveList = await listChapters(token, {
        subjectId: subjectThree._id.toString(),
        search: 'Computer Basics',
      }).expect(200);

      expect(inactiveList.body.total).toBe(1);
      expect(inactiveList.body.items[0].name).toBe('Computer Basics');
      expect(inactiveList.body.items[0].subjectName).toBe('Computers');

      await createChapter(token, {
        name: 'New In Inactive',
        subjectId: subjectThree._id.toString(),
        referenceType: 'ncert',
        order: 2,
      }).expect(404);

      await subjectModel
        .updateOne({ _id: subjectTwo._id }, { $set: { deletedAt: new Date() } })
        .exec();

      const deletedList = await listChapters(token, {
        subjectId: subjectTwo._id.toString(),
        search: 'Living World',
      }).expect(200);

      expect(deletedList.body.total).toBe(1);
      expect(deletedList.body.items[0].name).toBe('Living World');
      expect(deletedList.body.items[0].subjectName).toBe('Science');

      await createChapter(token, {
        name: 'New In Deleted',
        subjectId: subjectTwo._id.toString(),
        referenceType: 'ncert',
        order: 3,
      }).expect(404);
    });
  });

  describe('tenant isolation', () => {
    it('keeps other tenants out of chapters', async () => {
      const greenwoodToken = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const rivertonToken = await appToken(RIVERTON_PRINCIPAL_EMAIL, PASSWORD);

      const rivertonList = await listChapters(rivertonToken).expect(200);

      expect(rivertonList.body.total).toBe(1);
      expect(rivertonList.body.items[0].name).toBe('Riverton Chapter');
      expect(rivertonList.body.items[0].subjectName).toBe('General Knowledge');
      expect(rivertonList.body.items[0].mediumName).toBe('Kannada');

      const fixture = await createViaApi(greenwoodToken);

      await patchChapter(rivertonToken, fixture.id, {
        name: 'Stolen Chapter',
      }).expect(404);
      await deleteChapter(rivertonToken, fixture.id).expect(404);
      await restoreChapter(rivertonToken, fixture.id).expect(404);

      const crossSubject = await createChapter(rivertonToken, {
        name: 'Cross Subject',
        subjectId: subjectOne._id.toString(),
        referenceType: 'ncert',
        order: 1,
      }).expect(404);

      expect(crossSubject.body.message).toContain(
        'Subject not found or inactive',
      );

      const crossList = await listChapters(rivertonToken, {
        subjectId: subjectOne._id.toString(),
      }).expect(200);

      expect(crossList.body.total).toBe(0);
    });
  });
});
