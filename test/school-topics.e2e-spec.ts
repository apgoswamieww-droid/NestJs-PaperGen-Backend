import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import { MailService } from '../src/mail/mail.service.js';
import {
  Chapter,
  type ChapterDocument,
} from '../src/schemas/chapter.schema.js';
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
import { Topic } from '../src/schemas/topic.schema.js';
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
let topicModel: Model<Topic>;

let english: MediumDocument;
let rivertonMedium: MediumDocument;

let standardOne: StandardDocument;
let standardTwo: StandardDocument;

let subjectOne: SubjectDocument;
let subjectTwo: SubjectDocument;
let subjectThree: SubjectDocument;

let chapterOne: ChapterDocument;
let chapterTwo: ChapterDocument;
let chapterThree: ChapterDocument;
let inactiveChapter: ChapterDocument;
let deletedChapter: ChapterDocument;

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

async function appToken(email: string, password: string): Promise<string> {
  const response = await login(email, password).expect(200);

  return response.body.accessToken as string;
}

function listTopics(token: string, query: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .get('/api/topics')
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

function createTopic(token: string, payload: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post('/api/topics')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function patchTopic(
  token: string,
  id: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .patch(`/api/topics/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function deleteTopic(token: string, id: string) {
  return request(app.getHttpServer())
    .delete(`/api/topics/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

function restoreTopic(token: string, id: string) {
  return request(app.getHttpServer())
    .post(`/api/topics/${id}/restore`)
    .set('Authorization', `Bearer ${token}`);
}

async function createViaApi(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const name = `Fixture ${new Types.ObjectId().toString()}`;
  const response = await createTopic(token, {
    name,
    chapterId: chapterOne._id.toString(),
    order: 90,
    ...overrides,
  }).expect(201);

  return { id: response.body.id as string, name: response.body.name as string };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-school-topics-test');
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
  topicModel = app.get<Model<Topic>>(getModelToken(Topic.name));

  const passwordHash = await passwordService.hash(PASSWORD);

  const greenwood = await tenantModel.create({
    name: 'Greenwood High',
    slug: 'greenwood-topics',
    type: 'school',
    plan: 'growth',
    status: 'active',
  });
  const riverton = await tenantModel.create({
    name: 'Riverton School',
    slug: 'riverton-topics',
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
  const hindi = await mediumModel.create({
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
  const inactiveStandard = await standardModel.create({
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

  const rivertonSubject = await subjectModel.create({
    tenantId: riverton._id,
    standardId: rivertonStandard._id,
    name: 'General Knowledge',
    nameKey: 'general knowledge',
    order: 1,
    status: 'active',
    deletedAt: null,
  });

  chapterOne = await chapterModel.create({
    tenantId: greenwood._id,
    subjectId: subjectOne._id,
    name: 'Number System',
    nameKey: 'number system',
    referenceType: 'ncert',
    order: 1,
    status: 'active',
    deletedAt: null,
  });
  chapterTwo = await chapterModel.create({
    tenantId: greenwood._id,
    subjectId: subjectTwo._id,
    name: 'Living World',
    nameKey: 'living world',
    referenceType: 'ncert',
    order: 2,
    status: 'active',
    deletedAt: null,
  });
  chapterThree = await chapterModel.create({
    tenantId: greenwood._id,
    subjectId: subjectThree._id,
    name: 'Computer Basics',
    nameKey: 'computer basics',
    referenceType: 'ncert',
    order: 1,
    status: 'active',
    deletedAt: null,
  });
  inactiveChapter = await chapterModel.create({
    tenantId: greenwood._id,
    subjectId: subjectOne._id,
    name: 'Algebra Basics',
    nameKey: 'algebra basics',
    referenceType: 'other',
    order: 4,
    status: 'inactive',
    deletedAt: null,
  });
  deletedChapter = await chapterModel.create({
    tenantId: greenwood._id,
    subjectId: subjectOne._id,
    name: 'Geometry Basics',
    nameKey: 'geometry basics',
    referenceType: 'ncert',
    order: 5,
    status: 'active',
    deletedAt: new Date(),
  });

  const rivertonChapter = await chapterModel.create({
    tenantId: riverton._id,
    subjectId: rivertonSubject._id,
    name: 'Riverton Chapter',
    nameKey: 'riverton chapter',
    referenceType: 'ncert',
    order: 1,
    status: 'active',
    deletedAt: null,
  });

  await topicModel.create([
    {
      tenantId: greenwood._id,
      chapterId: chapterOne._id,
      name: 'Whole Numbers',
      nameKey: 'whole numbers',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      chapterId: chapterOne._id,
      name: 'Integers',
      nameKey: 'integers',
      order: 2,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      chapterId: chapterTwo._id,
      name: 'Plants',
      nameKey: 'plants',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      chapterId: chapterOne._id,
      name: 'Solids',
      nameKey: 'solids',
      order: 3,
      status: 'inactive',
      deletedAt: null,
    },
    {
      tenantId: greenwood._id,
      chapterId: chapterThree._id,
      name: 'Hardware',
      nameKey: 'hardware',
      order: 1,
      status: 'active',
      deletedAt: null,
    },
    {
      tenantId: riverton._id,
      chapterId: rivertonChapter._id,
      name: 'Riverton Topic',
      nameKey: 'riverton topic',
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

describe('School topics (e2e)', () => {
  describe('access control', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer()).get('/api/topics').expect(401);
      await request(app.getHttpServer())
        .post('/api/topics')
        .send({
          name: 'No Token',
          chapterId: chapterOne._id.toString(),
          order: 1,
        })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/topics/${new Types.ObjectId().toString()}`)
        .send({ name: 'No Token' })
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/topics/${new Types.ObjectId().toString()}`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/topics/${new Types.ObjectId().toString()}/restore`)
        .expect(401);
    });

    it('lets teachers read but not manage topics', async () => {
      const teacherToken = await appToken(TEACHER_EMAIL, PASSWORD);
      const topic = await topicModel.findOne({ name: 'Integers' });

      const listed = await listTopics(teacherToken).expect(200);

      expect(listed.body.total).toBe(5);

      await createTopic(teacherToken, {
        name: 'Teacher Topic',
        chapterId: chapterOne._id.toString(),
        order: 5,
      }).expect(403);
      await patchTopic(teacherToken, topic?._id.toString() ?? '', {
        name: 'Teacher Edit',
      }).expect(403);
      await deleteTopic(teacherToken, topic?._id.toString() ?? '').expect(403);
      await restoreTopic(teacherToken, topic?._id.toString() ?? '').expect(403);
    });
  });

  describe('list', () => {
    it('returns seeded topics with chapter lineage and a live summary', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await listTopics(token).expect(200);

      expect(response.body.total).toBe(5);
      expect(response.body.summary).toEqual({
        active: 4,
        inactive: 1,
        deleted: 0,
      });

      const first = response.body.items[0] as Record<string, unknown>;

      expect(first).toMatchObject({
        name: 'Whole Numbers',
        chapterId: chapterOne._id.toString(),
        chapterName: 'Number System',
        subjectId: subjectOne._id.toString(),
        subjectName: 'Mathematics',
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

      expect(names).toEqual([
        'Whole Numbers',
        'Plants',
        'Hardware',
        'Integers',
        'Solids',
      ]);
    });

    it('filters by chapter, status and search', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const byChapter = await listTopics(token, {
        chapterId: chapterOne._id.toString(),
      }).expect(200);

      expect(byChapter.body.total).toBe(3);
      expect(
        (byChapter.body.items as { chapterName: string }[]).every(
          (item) => item.chapterName === 'Number System',
        ),
      ).toBe(true);

      const byStatus = await listTopics(token, {
        status: 'inactive',
      }).expect(200);

      expect(byStatus.body.total).toBe(1);
      expect(byStatus.body.items[0].name).toBe('Solids');

      const bySearch = await listTopics(token, {
        search: 'INTEG',
      }).expect(200);

      expect(bySearch.body.total).toBe(1);
      expect(bySearch.body.items[0].name).toBe('Integers');

      const escaped = await listTopics(token, { search: 'Integers*' }).expect(
        200,
      );

      expect(escaped.body.total).toBe(0);

      const blankChapter = await listTopics(token, {
        chapterId: '',
      }).expect(200);

      expect(blankChapter.body.total).toBe(5);
    });

    it('sorts by order and rejects invalid queries', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const latest = await createViaApi(token, { order: 99 });

      const sorted = await listTopics(token, {
        sort: 'order',
        dir: 'desc',
      }).expect(200);

      expect(sorted.body.items[0].id).toBe(latest.id);

      const byName = await listTopics(token, {
        sort: 'name',
        dir: 'asc',
      }).expect(200);

      const names = (byName.body.items as { name: string }[]).map(
        (item) => item.name,
      );

      expect(names).toEqual([
        latest.name,
        'Hardware',
        'Integers',
        'Plants',
        'Solids',
        'Whole Numbers',
      ]);

      await listTopics(token, { chapterId: 'not-an-id' }).expect(400);
      await listTopics(token, { status: 'archived' }).expect(400);
      await listTopics(token, { sort: 'email' }).expect(400);
      await listTopics(token, { dir: 'sideways' }).expect(400);
      await listTopics(token, { pageSize: 15 }).expect(400);
      await listTopics(token, { page: 0 }).expect(400);
    });

    it('paginates through topics', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const page = await listTopics(token, {
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
    it('creates a topic under an active chapter and trims the name', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await createTopic(token, {
        name: '  Ratio and Proportion  ',
        chapterId: chapterTwo._id.toString(),
        order: 10,
      }).expect(201);

      expect(response.body).toMatchObject({
        name: 'Ratio and Proportion',
        chapterId: chapterTwo._id.toString(),
        chapterName: 'Living World',
        subjectId: subjectTwo._id.toString(),
        subjectName: 'Science',
        standardId: standardTwo._id.toString(),
        standardName: 'Standard 2',
        mediumId: english._id.toString(),
        mediumName: 'English',
        order: 10,
        status: 'active',
        deletedAt: null,
      });
    });

    it('rejects duplicates per chapter but allows the same name under another chapter', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const duplicate = await createTopic(token, {
        name: 'integers',
        chapterId: chapterOne._id.toString(),
        order: 5,
      }).expect(409);

      expect(duplicate.body.message).toContain('already exists');

      await createTopic(token, {
        name: 'Integers',
        chapterId: chapterTwo._id.toString(),
        order: 11,
      }).expect(201);
    });

    it('rejects deleted, inactive and unknown chapters plus invalid payloads', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const deleted = await createTopic(token, {
        name: 'Ghost Topic',
        chapterId: deletedChapter._id.toString(),
        order: 1,
      }).expect(404);

      expect(deleted.body.message).toContain('Chapter not found or inactive');

      const inactive = await createTopic(token, {
        name: 'Ghost Topic',
        chapterId: inactiveChapter._id.toString(),
        order: 1,
      }).expect(404);

      expect(inactive.body.message).toContain('Chapter not found or inactive');

      await createTopic(token, {
        name: 'Ghost Topic',
        chapterId: new Types.ObjectId().toString(),
        order: 1,
      }).expect(404);
      await createTopic(token, {
        name: 'Bad Chapter',
        chapterId: 'not-an-id',
        order: 1,
      }).expect(400);
      await createTopic(token, {
        name: 'Bad Order',
        chapterId: chapterOne._id.toString(),
        order: 0,
      }).expect(400);
      await createTopic(token, {
        name: 'Bad Order',
        chapterId: chapterOne._id.toString(),
        order: 101,
      }).expect(400);
      await createTopic(token, {
        name: 'Bad Order',
        chapterId: chapterOne._id.toString(),
        order: 1.5,
      }).expect(400);
      await createTopic(token, {
        name: 'X',
        chapterId: chapterOne._id.toString(),
        order: 1,
      }).expect(400);
      await createTopic(token, {
        name: 'Bad Status',
        chapterId: chapterOne._id.toString(),
        order: 1,
        status: 'archived',
      }).expect(400);
      await createTopic(token, {
        name: 'Bad Field',
        chapterId: chapterOne._id.toString(),
        order: 1,
        unknown: true,
      }).expect(400);
    });
  });

  describe('update', () => {
    it('renames, reorders and moves a topic to another active chapter', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const renamed = await patchTopic(token, fixture.id, {
        name: 'Advanced Integers',
        order: 7,
        status: 'inactive',
      }).expect(200);

      expect(renamed.body).toMatchObject({
        id: fixture.id,
        name: 'Advanced Integers',
        chapterName: 'Number System',
        order: 7,
        status: 'inactive',
      });

      const moved = await patchTopic(token, fixture.id, {
        chapterId: chapterTwo._id.toString(),
      }).expect(200);

      expect(moved.body.chapterId).toBe(chapterTwo._id.toString());
      expect(moved.body.chapterName).toBe('Living World');
      expect(moved.body.subjectName).toBe('Science');
      expect(moved.body.standardName).toBe('Standard 2');
      expect(moved.body.mediumName).toBe('English');
    });

    it('rejects duplicate names within the target chapter on rename and move', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      const rename = await patchTopic(token, fixture.id, {
        name: 'integers',
      }).expect(409);

      expect(rename.body.message).toContain('already exists');

      const move = await patchTopic(token, fixture.id, {
        chapterId: chapterTwo._id.toString(),
        name: 'Plants',
      }).expect(409);

      expect(move.body.message).toContain('already exists');
    });

    it('rejects unknown topics, chapters and invalid payloads', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await patchTopic(token, fixture.id, { name: 'X' }).expect(400);
      await patchTopic(token, fixture.id, { order: 0 }).expect(400);
      await patchTopic(token, fixture.id, { status: 'archived' }).expect(400);
      await patchTopic(token, fixture.id, { chapterId: 'not-an-id' }).expect(
        400,
      );
      await patchTopic(token, fixture.id, {
        chapterId: new Types.ObjectId().toString(),
      }).expect(404);
      await patchTopic(token, fixture.id, {
        chapterId: inactiveChapter._id.toString(),
      }).expect(404);
      await patchTopic(token, fixture.id, {
        chapterId: deletedChapter._id.toString(),
      }).expect(404);
      await patchTopic(token, 'not-an-id', {
        name: 'Ghost Topic',
      }).expect(404);
      await patchTopic(token, new Types.ObjectId().toString(), {
        name: 'Ghost Topic',
      }).expect(404);
    });
  });

  describe('delete', () => {
    it('soft deletes and hides the topic from the default list', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteTopic(token, fixture.id).expect(204);

      const hidden = await listTopics(token, {
        search: fixture.name,
      }).expect(200);

      expect(hidden.body.total).toBe(0);

      const included = await listTopics(token, {
        search: fixture.name,
        includeDeleted: 'true',
      }).expect(200);

      expect(included.body.total).toBe(1);
      expect(typeof included.body.items[0].deletedAt).toBe('string');

      await deleteTopic(token, fixture.id).expect(404);

      const raw = await topicModel.findById(fixture.id).exec();

      expect(raw?.deletedAt).toBeInstanceOf(Date);
    });

    it('frees the name for reuse within the same chapter', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Reusable ${new Types.ObjectId().toString()}`;
      const response = await createTopic(token, {
        name,
        chapterId: chapterOne._id.toString(),
        order: 50,
      }).expect(201);

      await deleteTopic(token, response.body.id as string).expect(204);
      await createTopic(token, {
        name,
        chapterId: chapterOne._id.toString(),
        order: 50,
      }).expect(201);
    });

    it('rejects unknown topics', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await deleteTopic(token, 'not-an-id').expect(404);
      await deleteTopic(token, new Types.ObjectId().toString()).expect(404);
    });
  });

  describe('restore', () => {
    it('restores a deleted topic', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await deleteTopic(token, fixture.id).expect(204);

      const restored = await restoreTopic(token, fixture.id).expect(200);

      expect(restored.body).toMatchObject({
        id: fixture.id,
        name: fixture.name,
        chapterName: 'Number System',
        deletedAt: null,
      });

      await restoreTopic(token, fixture.id).expect(404);
    });

    it('refuses to restore when the name was reused in the same chapter', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const name = `Conflict ${new Types.ObjectId().toString()}`;
      const first = await createTopic(token, {
        name,
        chapterId: chapterOne._id.toString(),
        order: 60,
      }).expect(201);

      await deleteTopic(token, first.body.id as string).expect(204);
      await createTopic(token, {
        name,
        chapterId: chapterOne._id.toString(),
        order: 60,
      }).expect(201);

      const conflict = await restoreTopic(
        token,
        first.body.id as string,
      ).expect(409);

      expect(conflict.body.message).toContain('already exists');
    });

    it('rejects unknown or live topics', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const fixture = await createViaApi(token);

      await restoreTopic(token, 'not-an-id').expect(404);
      await restoreTopic(token, new Types.ObjectId().toString()).expect(404);
      await restoreTopic(token, fixture.id).expect(404);
    });
  });

  describe('inactive and deleted chapters', () => {
    it('keeps topics visible when their chapter is inactive or deleted but blocks new ones', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      await chapterModel
        .updateOne({ _id: chapterThree._id }, { $set: { status: 'inactive' } })
        .exec();

      const inactiveList = await listTopics(token, {
        chapterId: chapterThree._id.toString(),
        search: 'Hardware',
      }).expect(200);

      expect(inactiveList.body.total).toBe(1);
      expect(inactiveList.body.items[0].name).toBe('Hardware');
      expect(inactiveList.body.items[0].chapterName).toBe('Computer Basics');

      await createTopic(token, {
        name: 'New In Inactive',
        chapterId: chapterThree._id.toString(),
        order: 2,
      }).expect(404);

      await chapterModel
        .updateOne({ _id: chapterTwo._id }, { $set: { deletedAt: new Date() } })
        .exec();

      const deletedList = await listTopics(token, {
        chapterId: chapterTwo._id.toString(),
        search: 'Plants',
      }).expect(200);

      expect(deletedList.body.total).toBe(1);
      expect(deletedList.body.items[0].name).toBe('Plants');
      expect(deletedList.body.items[0].chapterName).toBe('Living World');

      await createTopic(token, {
        name: 'New In Deleted',
        chapterId: chapterTwo._id.toString(),
        order: 3,
      }).expect(404);
    });
  });

  describe('tenant isolation', () => {
    it('keeps other tenants out of topics', async () => {
      const greenwoodToken = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const rivertonToken = await appToken(RIVERTON_PRINCIPAL_EMAIL, PASSWORD);

      const rivertonList = await listTopics(rivertonToken).expect(200);

      expect(rivertonList.body.total).toBe(1);
      expect(rivertonList.body.items[0].name).toBe('Riverton Topic');
      expect(rivertonList.body.items[0].chapterName).toBe('Riverton Chapter');
      expect(rivertonList.body.items[0].mediumName).toBe('Kannada');

      const fixture = await createViaApi(greenwoodToken);

      await patchTopic(rivertonToken, fixture.id, {
        name: 'Stolen Topic',
      }).expect(404);
      await deleteTopic(rivertonToken, fixture.id).expect(404);
      await restoreTopic(rivertonToken, fixture.id).expect(404);

      const crossChapter = await createTopic(rivertonToken, {
        name: 'Cross Chapter',
        chapterId: chapterOne._id.toString(),
        order: 1,
      }).expect(404);

      expect(crossChapter.body.message).toContain(
        'Chapter not found or inactive',
      );

      const crossList = await listTopics(rivertonToken, {
        chapterId: chapterOne._id.toString(),
      }).expect(200);

      expect(crossList.body.total).toBe(0);
    });
  });
});
