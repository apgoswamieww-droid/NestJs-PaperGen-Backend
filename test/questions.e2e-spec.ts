import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import { MailService } from '../src/mail/mail.service.js';
import {
  BloomLevel,
  type BloomLevelDocument,
} from '../src/schemas/bloom-level.schema.js';
import {
  Chapter,
  type ChapterDocument,
} from '../src/schemas/chapter.schema.js';
import {
  DifficultyLevel,
  type DifficultyLevelDocument,
} from '../src/schemas/difficulty-level.schema.js';
import { Medium, type MediumDocument } from '../src/schemas/medium.schema.js';
import {
  QuestionType,
  type QuestionTypeDocument,
} from '../src/schemas/question-type.schema.js';
import { Question } from '../src/schemas/question.schema.js';
import {
  Standard,
  type StandardDocument,
} from '../src/schemas/standard.schema.js';
import {
  Subject,
  type SubjectDocument,
} from '../src/schemas/subject.schema.js';
import { Tenant } from '../src/schemas/tenant.schema.js';
import { Topic, type TopicDocument } from '../src/schemas/topic.schema.js';
import { User } from '../src/schemas/user.schema.js';

const PASSWORD = 'School@12345';
const ADMIN_EMAIL = 'principal@greenwood.test';
const TEACHER_EMAIL = 'teacher@greenwood.test';
const STAFF_EMAIL = 'staff@greenwood.test';
const RIVERTON_EMAIL = 'principal@riverton.test';

let app: INestApplication;
let mongo: MongoMemoryServer;
let questionModel: Model<Question>;
let mediumModel: Model<Medium>;
let standardModel: Model<Standard>;
let subjectModel: Model<Subject>;
let chapterModel: Model<Chapter>;
let topicModel: Model<Topic>;
let questionTypeModel: Model<QuestionType>;
let difficultyLevelModel: Model<DifficultyLevel>;
let bloomLevelModel: Model<BloomLevel>;

let greenwoodId: Types.ObjectId;
let english: MediumDocument;
let standardOne: StandardDocument;
let standardTwo: StandardDocument;
let mathematics: SubjectDocument;
let science: SubjectDocument;
let chapterOne: ChapterDocument;
let chapterTwo: ChapterDocument;
let inactiveChapter: ChapterDocument;
let deletedChapter: ChapterDocument;
let topicOne: TopicDocument;
let topicTwo: TopicDocument;
let topicThree: TopicDocument;
let inactiveTopic: TopicDocument;
let deletedTopic: TopicDocument;
let mcqType: QuestionTypeDocument;
let shortAnswerType: QuestionTypeDocument;
let inactiveQuestionType: QuestionTypeDocument;
let deletedQuestionType: QuestionTypeDocument;
let easyDifficulty: DifficultyLevelDocument;
let inactiveDifficulty: DifficultyLevelDocument;
let rememberBloom: BloomLevelDocument;
let inactiveBloom: BloomLevelDocument;
let deletedBloom: BloomLevelDocument;
let rivertonChapter: ChapterDocument;
let rivertonTopic: TopicDocument;
let rivertonQuestionType: QuestionTypeDocument;
let rivertonDifficulty: DifficultyLevelDocument;

let adminToken: string;
let teacherToken: string;
let staffToken: string;
let rivertonToken: string;

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

async function appToken(email: string, password: string): Promise<string> {
  const response = await login(email, password).expect(200);

  return response.body.accessToken as string;
}

function listQuestions(token: string, query: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .get('/api/questions')
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

function getQuestion(token: string, id: string) {
  return request(app.getHttpServer())
    .get(`/api/questions/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

function createQuestion(token: string, payload: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post('/api/questions')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function patchQuestion(
  token: string,
  id: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .patch(`/api/questions/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function deleteQuestion(token: string, id: string) {
  return request(app.getHttpServer())
    .delete(`/api/questions/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

function restoreQuestion(token: string, id: string) {
  return request(app.getHttpServer())
    .post(`/api/questions/${id}/restore`)
    .set('Authorization', `Bearer ${token}`);
}

function questionPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    text: `Question ${new Types.ObjectId().toString()}`,
    chapterId: chapterOne._id.toString(),
    topicId: topicOne._id.toString(),
    questionTypeId: mcqType._id.toString(),
    difficultyLevelId: easyDifficulty._id.toString(),
    bloomLevelId: rememberBloom._id.toString(),
    options: [
      { key: 'A', text: 'First', isCorrect: true },
      { key: 'B', text: 'Second', isCorrect: false },
      { key: 'C', text: 'Third', isCorrect: false },
      { key: 'D', text: 'Fourth', isCorrect: false },
    ],
    marks: 1,
    ...overrides,
  };
}

async function createFixture(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const response = await createQuestion(
    token,
    questionPayload(overrides),
  ).expect(201);

  return response.body as Record<string, unknown>;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-questions-test');
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

  questionModel = app.get<Model<Question>>(getModelToken(Question.name));
  mediumModel = app.get<Model<Medium>>(getModelToken(Medium.name));
  standardModel = app.get<Model<Standard>>(getModelToken(Standard.name));
  subjectModel = app.get<Model<Subject>>(getModelToken(Subject.name));
  chapterModel = app.get<Model<Chapter>>(getModelToken(Chapter.name));
  topicModel = app.get<Model<Topic>>(getModelToken(Topic.name));
  questionTypeModel = app.get<Model<QuestionType>>(
    getModelToken(QuestionType.name),
  );
  difficultyLevelModel = app.get<Model<DifficultyLevel>>(
    getModelToken(DifficultyLevel.name),
  );
  bloomLevelModel = app.get<Model<BloomLevel>>(getModelToken(BloomLevel.name));

  const passwordHash = await passwordService.hash(PASSWORD);
  const greenwood = await tenantModel.create({
    name: 'Greenwood High',
    slug: 'greenwood-questions',
    type: 'school',
    plan: 'growth',
    status: 'active',
  });
  const riverton = await tenantModel.create({
    name: 'Riverton School',
    slug: 'riverton-questions',
    type: 'school',
    plan: 'starter',
    status: 'active',
  });

  greenwoodId = greenwood._id;

  await app.get<Model<User>>(getModelToken(User.name)).create([
    {
      tenantId: greenwood._id,
      name: 'Asha Deshmukh',
      email: ADMIN_EMAIL,
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
      name: 'Meera Patil',
      email: STAFF_EMAIL,
      role: 'staff',
      passwordHash,
      status: 'active',
      passwordChangedAt: new Date(),
    },
    {
      tenantId: riverton._id,
      name: 'Vikram Rathod',
      email: RIVERTON_EMAIL,
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
  const rivertonMedium = await mediumModel.create({
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
  const rivertonStandard = await standardModel.create({
    tenantId: riverton._id,
    mediumId: rivertonMedium._id,
    name: 'Standard 1',
    nameKey: 'standard 1',
    order: 1,
    status: 'active',
    deletedAt: null,
  });

  mathematics = await subjectModel.create({
    tenantId: greenwood._id,
    standardId: standardOne._id,
    name: 'Mathematics',
    nameKey: 'mathematics',
    order: 1,
    status: 'active',
    deletedAt: null,
  });
  science = await subjectModel.create({
    tenantId: greenwood._id,
    standardId: standardTwo._id,
    name: 'Science',
    nameKey: 'science',
    order: 2,
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
    subjectId: mathematics._id,
    name: 'Number System',
    nameKey: 'number system',
    referenceType: 'ncert',
    order: 1,
    status: 'active',
    deletedAt: null,
  });
  chapterTwo = await chapterModel.create({
    tenantId: greenwood._id,
    subjectId: science._id,
    name: 'Living World',
    nameKey: 'living world',
    referenceType: 'ncert',
    order: 1,
    status: 'active',
    deletedAt: null,
  });
  inactiveChapter = await chapterModel.create({
    tenantId: greenwood._id,
    subjectId: mathematics._id,
    name: 'Archived Chapter',
    nameKey: 'archived chapter',
    referenceType: 'other',
    order: 2,
    status: 'inactive',
    deletedAt: null,
  });
  deletedChapter = await chapterModel.create({
    tenantId: greenwood._id,
    subjectId: mathematics._id,
    name: 'Deleted Chapter',
    nameKey: 'deleted chapter',
    referenceType: 'other',
    order: 3,
    status: 'active',
    deletedAt: new Date(),
  });
  rivertonChapter = await chapterModel.create({
    tenantId: riverton._id,
    subjectId: rivertonSubject._id,
    name: 'Riverton Chapter',
    nameKey: 'riverton chapter',
    referenceType: 'ncert',
    order: 1,
    status: 'active',
    deletedAt: null,
  });

  topicOne = await topicModel.create({
    tenantId: greenwood._id,
    chapterId: chapterOne._id,
    name: 'Whole Numbers',
    nameKey: 'whole numbers',
    order: 1,
    status: 'active',
    deletedAt: null,
  });
  topicTwo = await topicModel.create({
    tenantId: greenwood._id,
    chapterId: chapterTwo._id,
    name: 'Plants',
    nameKey: 'plants',
    order: 1,
    status: 'active',
    deletedAt: null,
  });
  topicThree = await topicModel.create({
    tenantId: greenwood._id,
    chapterId: chapterOne._id,
    name: 'Integers',
    nameKey: 'integers',
    order: 2,
    status: 'active',
    deletedAt: null,
  });
  inactiveTopic = await topicModel.create({
    tenantId: greenwood._id,
    chapterId: chapterOne._id,
    name: 'Solids',
    nameKey: 'solids',
    order: 3,
    status: 'inactive',
    deletedAt: null,
  });
  deletedTopic = await topicModel.create({
    tenantId: greenwood._id,
    chapterId: chapterOne._id,
    name: 'Old Topic',
    nameKey: 'old topic',
    order: 4,
    status: 'active',
    deletedAt: new Date(),
  });
  rivertonTopic = await topicModel.create({
    tenantId: riverton._id,
    chapterId: rivertonChapter._id,
    name: 'Riverton Topic',
    nameKey: 'riverton topic',
    order: 1,
    status: 'active',
    deletedAt: null,
  });

  mcqType = await questionTypeModel.create({
    tenantId: greenwood._id,
    name: 'Multiple Choice',
    nameKey: 'multiple choice',
    order: 1,
    status: 'active',
    deletedAt: null,
  });
  shortAnswerType = await questionTypeModel.create({
    tenantId: greenwood._id,
    name: 'Short Answer',
    nameKey: 'short answer',
    order: 2,
    status: 'active',
    deletedAt: null,
  });
  inactiveQuestionType = await questionTypeModel.create({
    tenantId: greenwood._id,
    name: 'Inactive Type',
    nameKey: 'inactive type',
    order: 3,
    status: 'inactive',
    deletedAt: null,
  });
  deletedQuestionType = await questionTypeModel.create({
    tenantId: greenwood._id,
    name: 'Deleted Type',
    nameKey: 'deleted type',
    order: 4,
    status: 'active',
    deletedAt: new Date(),
  });
  rivertonQuestionType = await questionTypeModel.create({
    tenantId: riverton._id,
    name: 'Riverton Type',
    nameKey: 'riverton type',
    order: 1,
    status: 'active',
    deletedAt: null,
  });

  easyDifficulty = await difficultyLevelModel.create({
    tenantId: greenwood._id,
    name: 'Easy',
    nameKey: 'easy',
    order: 1,
    status: 'active',
    deletedAt: null,
  });
  inactiveDifficulty = await difficultyLevelModel.create({
    tenantId: greenwood._id,
    name: 'Hard',
    nameKey: 'hard',
    order: 2,
    status: 'inactive',
    deletedAt: null,
  });
  rivertonDifficulty = await difficultyLevelModel.create({
    tenantId: riverton._id,
    name: 'Easy',
    nameKey: 'easy',
    order: 1,
    status: 'active',
    deletedAt: null,
  });

  rememberBloom = await bloomLevelModel.create({
    tenantId: greenwood._id,
    name: 'Remember',
    nameKey: 'remember',
    order: 1,
    status: 'active',
    deletedAt: null,
  });
  inactiveBloom = await bloomLevelModel.create({
    tenantId: greenwood._id,
    name: 'Apply',
    nameKey: 'apply',
    order: 2,
    status: 'inactive',
    deletedAt: null,
  });
  deletedBloom = await bloomLevelModel.create({
    tenantId: greenwood._id,
    name: 'Analyse',
    nameKey: 'analyse',
    order: 3,
    status: 'active',
    deletedAt: new Date(),
  });

  adminToken = await appToken(ADMIN_EMAIL, PASSWORD);
  teacherToken = await appToken(TEACHER_EMAIL, PASSWORD);
  staffToken = await appToken(STAFF_EMAIL, PASSWORD);
  rivertonToken = await appToken(RIVERTON_EMAIL, PASSWORD);
}, 120_000);

beforeEach(async () => {
  await questionModel.deleteMany({}).exec();
});

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

describe('Question bank (e2e)', () => {
  describe('access control', () => {
    it('rejects requests without a token', async () => {
      const id = new Types.ObjectId().toString();

      await request(app.getHttpServer()).get('/api/questions').expect(401);
      await request(app.getHttpServer())
        .get(`/api/questions/${id}`)
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/questions')
        .send(questionPayload())
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/questions/${id}`)
        .send({ text: 'No token' })
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/questions/${id}`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/questions/${id}/restore`)
        .expect(401);
    });

    it('lets staff read but not manage questions', async () => {
      const fixture = await createFixture(adminToken);
      const id = fixture['id'] as string;

      const listed = await listQuestions(staffToken).expect(200);

      expect(listed.body.total).toBe(1);

      const detail = await getQuestion(staffToken, id).expect(200);

      expect(detail.body.id).toBe(id);

      await createQuestion(staffToken, questionPayload()).expect(403);
      await patchQuestion(staffToken, id, { text: 'Staff edit' }).expect(403);
      await deleteQuestion(staffToken, id).expect(403);
      await restoreQuestion(staffToken, id).expect(403);
    });

    it('lets teachers create and edit questions', async () => {
      const fixture = await createFixture(teacherToken);

      expect(fixture['text']).toContain('Question');

      const updated = await patchQuestion(
        teacherToken,
        fixture['id'] as string,
        { marks: 2 },
      ).expect(200);

      expect(updated.body.marks).toBe(2);
    });
  });

  describe('list and detail', () => {
    it('returns lineage, answer metadata and a live summary', async () => {
      const mcq = await createFixture(adminToken, {
        text: 'Which number is even?',
        marks: 2,
      });

      const subjective = await createFixture(adminToken, {
        text: 'Explain photosynthesis.',
        chapterId: chapterTwo._id.toString(),
        topicId: topicTwo._id.toString(),
        questionTypeId: shortAnswerType._id.toString(),
        options: [],
        answer: 'Plants convert light into chemical energy.',
        marks: 5,
      });

      const draft = await createFixture(adminToken, {
        text: 'Draft question',
        options: [],
        answer: '',
        status: 'inactive',
      });

      const response = await listQuestions(adminToken).expect(200);

      expect(response.body).toMatchObject({
        total: 3,
        page: 1,
        pageSize: 10,
        summary: { total: 3, active: 2, inactive: 1, deleted: 0 },
      });

      const items = response.body.items as Record<string, unknown>[];
      const mcqItem = items.find((item) => item['id'] === mcq['id']);
      const subjectiveItem = items.find(
        (item) => item['id'] === subjective['id'],
      );
      const draftItem = items.find((item) => item['id'] === draft['id']);

      expect(mcqItem).toMatchObject({
        text: 'Which number is even?',
        marks: 2,
        status: 'active',
        chapterId: chapterOne._id.toString(),
        chapterName: 'Number System',
        subjectId: mathematics._id.toString(),
        subjectName: 'Mathematics',
        standardId: standardOne._id.toString(),
        standardName: 'Standard 1',
        mediumId: english._id.toString(),
        mediumName: 'English',
        topicId: topicOne._id.toString(),
        topicName: 'Whole Numbers',
        questionTypeName: 'Multiple Choice',
        difficultyLevelName: 'Easy',
        bloomLevelName: 'Remember',
        optionCount: 4,
        hasAnswer: true,
      });
      expect(typeof mcqItem?.['createdAt']).toBe('string');
      expect(typeof mcqItem?.['updatedAt']).toBe('string');

      expect(subjectiveItem).toMatchObject({
        chapterName: 'Living World',
        subjectName: 'Science',
        standardName: 'Standard 2',
        topicName: 'Plants',
        questionTypeName: 'Short Answer',
        optionCount: 0,
        hasAnswer: true,
      });
      expect(draftItem).toMatchObject({
        status: 'inactive',
        hasAnswer: false,
      });

      const detail = await getQuestion(adminToken, mcq['id'] as string).expect(
        200,
      );

      expect(detail.body).toMatchObject({
        id: mcq['id'],
        text: 'Which number is even?',
        answer: '',
        options: [
          { key: 'A', text: 'First', isCorrect: true },
          { key: 'B', text: 'Second', isCorrect: false },
          { key: 'C', text: 'Third', isCorrect: false },
          { key: 'D', text: 'Fourth', isCorrect: false },
        ],
        tags: [],
        deletedAt: null,
      });
      expect(typeof detail.body.createdBy).toBe('string');
    });

    it('filters by hierarchy, masters, status and search', async () => {
      const mcq = await createFixture(adminToken, {
        text: 'Algebra shortcut',
        source: 'Board Archive',
        tags: [' algebra ', 'Algebra', 'Exam'],
      });
      const scienceQuestion = await createFixture(adminToken, {
        text: 'Plant cell question',
        chapterId: chapterTwo._id.toString(),
        topicId: topicTwo._id.toString(),
        questionTypeId: shortAnswerType._id.toString(),
        options: [],
        answer: 'A plant cell has a cell wall.',
        bloomLevelId: null,
      });

      for (const query of [
        { standardId: standardOne._id.toString() },
        { subjectId: mathematics._id.toString() },
        { chapterId: chapterOne._id.toString() },
        { topicId: topicOne._id.toString() },
        { questionTypeId: mcqType._id.toString() },
        { bloomLevelId: rememberBloom._id.toString() },
      ]) {
        const response = await listQuestions(adminToken, query).expect(200);

        expect(response.body.total).toBe(1);
        expect(response.body.items[0].id).toBe(mcq['id']);
      }

      const byMedium = await listQuestions(adminToken, {
        mediumId: english._id.toString(),
      }).expect(200);

      expect(byMedium.body.total).toBe(2);

      const byStandard = await listQuestions(adminToken, {
        standardId: standardTwo._id.toString(),
      }).expect(200);

      expect(byStandard.body.total).toBe(1);
      expect(byStandard.body.items[0].id).toBe(scienceQuestion['id']);

      const byDifficulty = await listQuestions(adminToken, {
        difficultyLevelId: easyDifficulty._id.toString(),
      }).expect(200);

      expect(byDifficulty.body.total).toBe(2);

      const bySource = await listQuestions(adminToken, {
        search: 'archive',
      }).expect(200);

      expect(bySource.body.total).toBe(1);

      const byTag = await listQuestions(adminToken, {
        search: 'exam',
      }).expect(200);

      expect(byTag.body.total).toBe(1);

      const byAnswer = await listQuestions(adminToken, {
        search: 'cell wall',
      }).expect(200);

      expect(byAnswer.body.total).toBe(1);
      expect(byAnswer.body.items[0].id).toBe(scienceQuestion['id']);

      const inactive = await listQuestions(adminToken, {
        status: 'inactive',
      }).expect(200);

      expect(inactive.body.total).toBe(0);

      const mismatch = await listQuestions(adminToken, {
        chapterId: chapterOne._id.toString(),
        topicId: topicTwo._id.toString(),
      }).expect(200);

      expect(mismatch.body.total).toBe(0);

      const escaped = await listQuestions(adminToken, {
        search: 'Algebra*',
      }).expect(200);

      expect(escaped.body.total).toBe(0);

      const blank = await listQuestions(adminToken, {
        chapterId: '',
        status: '',
      }).expect(200);

      expect(blank.body.total).toBe(2);
    });

    it('sorts, paginates and validates queries', async () => {
      const low = await createFixture(adminToken, {
        text: 'Low marks',
        marks: 1,
      });
      const high = await createFixture(adminToken, {
        text: 'High marks',
        marks: 10,
      });

      const sorted = await listQuestions(adminToken, {
        sort: 'marks',
        dir: 'desc',
      }).expect(200);

      expect(sorted.body.items[0].id).toBe(high['id']);
      expect(sorted.body.items[1].id).toBe(low['id']);

      for (let index = 0; index < 9; index += 1) {
        await questionModel.create({
          tenantId: greenwoodId,
          chapterId: chapterOne._id,
          topicId: null,
          questionTypeId: mcqType._id,
          difficultyLevelId: easyDifficulty._id,
          bloomLevelId: null,
          text: `Paged question ${index}`,
          options: [],
          answer: 'A written answer.',
          explanation: '',
          source: '',
          tags: [],
          marks: 1,
          status: 'active',
          deletedAt: null,
        });
      }

      const firstPage = await listQuestions(adminToken, {
        pageSize: 10,
        page: 1,
      }).expect(200);

      expect(firstPage.body.total).toBe(11);
      expect((firstPage.body.items as unknown[]).length).toBe(10);

      const secondPage = await listQuestions(adminToken, {
        pageSize: 10,
        page: 2,
      }).expect(200);

      expect((secondPage.body.items as unknown[]).length).toBe(1);

      await listQuestions(adminToken, { mediumId: 'bad' }).expect(400);
      await listQuestions(adminToken, { status: 'archived' }).expect(400);
      await listQuestions(adminToken, { sort: 'email' }).expect(400);
      await listQuestions(adminToken, { dir: 'sideways' }).expect(400);
      await listQuestions(adminToken, { pageSize: 15 }).expect(400);
      await listQuestions(adminToken, { page: 0 }).expect(400);
      await listQuestions(adminToken, { unknown: true }).expect(400);
    });

    it('rejects unknown and cross-tenant detail requests', async () => {
      const fixture = await createFixture(adminToken);

      await getQuestion(adminToken, 'not-an-id').expect(404);
      await getQuestion(adminToken, new Types.ObjectId().toString()).expect(
        404,
      );
      await getQuestion(rivertonToken, fixture['id'] as string).expect(404);
    });
  });

  describe('create', () => {
    it('trims input, normalises options and tags, and stores answer metadata', async () => {
      const response = await createQuestion(
        adminToken,
        questionPayload({
          text: '  What is 2 + 2?  ',
          source: '  Unit test  ',
          tags: [' Addition ', 'addition', 'Numbers'],
          options: [
            { key: ' a ', text: ' 3 ', isCorrect: false },
            { key: 'b', text: ' 4 ', isCorrect: true },
          ],
          marks: 0.5,
        }),
      ).expect(201);

      expect(response.body).toMatchObject({
        text: 'What is 2 + 2?',
        source: 'Unit test',
        tags: ['Addition', 'Numbers'],
        marks: 0.5,
        status: 'active',
        hasAnswer: true,
        optionCount: 2,
        options: [
          { key: 'A', text: '3', isCorrect: false },
          { key: 'B', text: '4', isCorrect: true },
        ],
        chapterName: 'Number System',
        topicName: 'Whole Numbers',
      });
      expect(typeof response.body.createdBy).toBe('string');
      expect(typeof response.body.updatedBy).toBe('string');
    });

    it('allows inactive drafts without an answer key', async () => {
      const response = await createQuestion(
        adminToken,
        questionPayload({
          text: 'Draft without answer',
          options: [],
          answer: '',
          status: 'inactive',
        }),
      ).expect(201);

      expect(response.body).toMatchObject({
        status: 'inactive',
        options: [],
        hasAnswer: false,
      });
    });

    it('validates option and answer rules', async () => {
      const noCorrect = await createQuestion(
        adminToken,
        questionPayload({
          options: [
            { key: 'A', text: 'First', isCorrect: false },
            { key: 'B', text: 'Second', isCorrect: false },
          ],
        }),
      ).expect(400);

      expect(noCorrect.body.message).toContain(
        'Mark at least one option as correct.',
      );

      const duplicate = await createQuestion(
        adminToken,
        questionPayload({
          options: [
            { key: 'A', text: 'First', isCorrect: true },
            { key: 'a', text: 'Second', isCorrect: false },
          ],
        }),
      ).expect(400);

      expect(duplicate.body.message).toContain('Option keys must be unique.');

      await createQuestion(
        adminToken,
        questionPayload({
          options: [{ key: 'A', text: 'Only', isCorrect: true }],
        }),
      ).expect(400);
      await createQuestion(
        adminToken,
        questionPayload({
          options: [
            { key: 'A', text: ' ', isCorrect: true },
            { key: 'B', text: 'Second', isCorrect: false },
          ],
        }),
      ).expect(400);
      await createQuestion(
        adminToken,
        questionPayload({
          options: Array.from({ length: 11 }, (_, index) => ({
            key: String.fromCharCode(65 + index),
            text: `Option ${index}`,
            isCorrect: index === 0,
          })),
        }),
      ).expect(400);

      const noAnswer = await createQuestion(
        adminToken,
        questionPayload({
          options: [],
          answer: '',
        }),
      ).expect(400);

      expect(noAnswer.body.message).toContain(
        'Add an answer or mark a correct option',
      );
      await createQuestion(
        adminToken,
        questionPayload({ options: [], answer: '   ' }),
      ).expect(400);
    });

    it('rejects invalid, inactive, deleted and cross-tenant references', async () => {
      for (const payload of [
        { chapterId: inactiveChapter._id.toString() },
        { chapterId: deletedChapter._id.toString() },
        { chapterId: new Types.ObjectId().toString() },
        { topicId: topicTwo._id.toString() },
        { topicId: inactiveTopic._id.toString() },
        { topicId: deletedTopic._id.toString() },
        { topicId: new Types.ObjectId().toString() },
        { questionTypeId: inactiveQuestionType._id.toString() },
        { questionTypeId: deletedQuestionType._id.toString() },
        { difficultyLevelId: inactiveDifficulty._id.toString() },
        { bloomLevelId: inactiveBloom._id.toString() },
        { bloomLevelId: deletedBloom._id.toString() },
        { chapterId: rivertonChapter._id.toString() },
        { questionTypeId: rivertonQuestionType._id.toString() },
      ]) {
        await createQuestion(adminToken, questionPayload(payload)).expect(404);
      }

      await createQuestion(
        adminToken,
        questionPayload({ chapterId: 'not-an-id' }),
      ).expect(400);
      await createQuestion(
        adminToken,
        questionPayload({ topicId: 'not-an-id' }),
      ).expect(400);
      await createQuestion(adminToken, questionPayload({ marks: 0 })).expect(
        400,
      );
      await createQuestion(adminToken, questionPayload({ marks: 101 })).expect(
        400,
      );
      await createQuestion(adminToken, questionPayload({ marks: 1.25 })).expect(
        400,
      );
      await createQuestion(adminToken, questionPayload({ text: '   ' })).expect(
        400,
      );
      await createQuestion(
        adminToken,
        questionPayload({ tags: Array.from({ length: 21 }, () => 'tag') }),
      ).expect(400);
      await createQuestion(
        adminToken,
        questionPayload({ tags: ['x'.repeat(31)] }),
      ).expect(400);
      await createQuestion(
        adminToken,
        questionPayload({ unknown: true }),
      ).expect(400);
    });
  });

  describe('update', () => {
    it('edits content, options, tags, marks, status and topic', async () => {
      const fixture = await createFixture(adminToken);

      const updated = await patchQuestion(adminToken, fixture['id'] as string, {
        text: '  Updated question  ',
        marks: 3.5,
        source: 'Updated source',
        tags: ['Updated', 'updated', 'Maths'],
        options: [
          { key: 'A', text: 'One', isCorrect: false },
          { key: 'B', text: 'Two', isCorrect: true },
        ],
        topicId: topicThree._id.toString(),
        status: 'active',
      }).expect(200);

      expect(updated.body).toMatchObject({
        id: fixture['id'],
        text: 'Updated question',
        marks: 3.5,
        source: 'Updated source',
        tags: ['Updated', 'Maths'],
        topicId: topicThree._id.toString(),
        topicName: 'Integers',
        optionCount: 2,
        hasAnswer: true,
        status: 'active',
      });
      expect(updated.body.options).toEqual([
        { key: 'A', text: 'One', isCorrect: false },
        { key: 'B', text: 'Two', isCorrect: true },
      ]);
    });

    it('moves chapters, clears stale topics and validates new topics', async () => {
      const fixture = await createFixture(adminToken);

      const moved = await patchQuestion(adminToken, fixture['id'] as string, {
        chapterId: chapterTwo._id.toString(),
        topicId: null,
      }).expect(200);

      expect(moved.body).toMatchObject({
        chapterId: chapterTwo._id.toString(),
        chapterName: 'Living World',
        subjectName: 'Science',
        standardName: 'Standard 2',
        topicId: null,
        topicName: null,
      });

      await patchQuestion(adminToken, fixture['id'] as string, {
        topicId: topicOne._id.toString(),
      }).expect(404);

      const topicSet = await patchQuestion(
        adminToken,
        fixture['id'] as string,
        { topicId: topicTwo._id.toString() },
      ).expect(200);

      expect(topicSet.body.topicName).toBe('Plants');

      const autoClear = await createFixture(adminToken);

      const cleared = await patchQuestion(
        adminToken,
        autoClear['id'] as string,
        { chapterId: chapterTwo._id.toString() },
      ).expect(200);

      expect(cleared.body.topicId).toBeNull();
    });

    it('keeps unchanged inactive references editable', async () => {
      const legacy = await questionModel.create({
        tenantId: greenwoodId,
        chapterId: inactiveChapter._id,
        topicId: null,
        questionTypeId: inactiveQuestionType._id,
        difficultyLevelId: inactiveDifficulty._id,
        bloomLevelId: inactiveBloom._id,
        text: 'Legacy question',
        options: [],
        answer: 'Legacy answer',
        marks: 1,
        status: 'inactive',
      });

      const updated = await patchQuestion(adminToken, legacy._id.toString(), {
        text: 'Legacy question revised',
        chapterId: inactiveChapter._id.toString(),
        topicId: null,
        questionTypeId: inactiveQuestionType._id.toString(),
        difficultyLevelId: inactiveDifficulty._id.toString(),
        bloomLevelId: inactiveBloom._id.toString(),
        options: [],
        answer: 'Legacy answer',
        marks: 1,
        status: 'inactive',
      }).expect(200);

      expect(updated.body).toMatchObject({
        text: 'Legacy question revised',
        questionTypeName: 'Inactive Type',
        difficultyLevelName: 'Hard',
        bloomLevelName: 'Apply',
      });

      await patchQuestion(adminToken, legacy._id.toString(), {
        questionTypeId: inactiveQuestionType._id.toString(),
      }).expect(200);

      await patchQuestion(adminToken, legacy._id.toString(), {
        bloomLevelId: inactiveBloom._id.toString(),
      }).expect(200);
    });

    it('enforces the active answer rule after edits', async () => {
      const mcq = await createFixture(adminToken);

      await patchQuestion(adminToken, mcq['id'] as string, {
        options: [
          { key: 'A', text: 'First', isCorrect: false },
          { key: 'B', text: 'Second', isCorrect: false },
        ],
        answer: '',
      }).expect(400);

      const draft = await createFixture(adminToken, {
        options: [],
        answer: '',
        status: 'inactive',
      });

      await patchQuestion(adminToken, draft['id'] as string, {
        status: 'active',
      }).expect(400);

      const published = await patchQuestion(adminToken, draft['id'] as string, {
        answer: 'A written answer.',
        status: 'active',
      }).expect(200);

      expect(published.body).toMatchObject({
        status: 'active',
        answer: 'A written answer.',
        hasAnswer: true,
      });

      const subjective = await createFixture(adminToken, {
        options: [],
        answer: 'Original answer',
      });

      const inactive = await patchQuestion(
        adminToken,
        subjective['id'] as string,
        { options: [], answer: '', status: 'inactive' },
      ).expect(200);

      expect(inactive.body).toMatchObject({
        status: 'inactive',
        hasAnswer: false,
      });
    });

    it('rejects invalid references and payloads', async () => {
      const fixture = await createFixture(adminToken);
      const id = fixture['id'] as string;

      await patchQuestion(adminToken, id, {
        chapterId: inactiveChapter._id.toString(),
      }).expect(404);
      await patchQuestion(adminToken, id, {
        chapterId: deletedChapter._id.toString(),
      }).expect(404);
      await patchQuestion(adminToken, id, {
        questionTypeId: inactiveQuestionType._id.toString(),
      }).expect(404);
      await patchQuestion(adminToken, id, {
        difficultyLevelId: inactiveDifficulty._id.toString(),
      }).expect(404);
      await patchQuestion(adminToken, id, {
        bloomLevelId: inactiveBloom._id.toString(),
      }).expect(404);
      await patchQuestion(adminToken, id, {
        bloomLevelId: deletedBloom._id.toString(),
      }).expect(404);
      await patchQuestion(adminToken, id, {
        topicId: topicTwo._id.toString(),
      }).expect(404);
      await patchQuestion(adminToken, id, {
        chapterId: 'not-an-id',
      }).expect(400);
      await patchQuestion(adminToken, id, { marks: 0 }).expect(400);
      await patchQuestion(adminToken, id, { marks: 1.25 }).expect(400);
      await patchQuestion(adminToken, id, {
        status: 'archived',
      }).expect(400);
      await patchQuestion(adminToken, id, { unknown: true }).expect(400);
      await patchQuestion(adminToken, 'not-an-id', {
        text: 'Ghost',
      }).expect(404);
      await patchQuestion(adminToken, new Types.ObjectId().toString(), {
        text: 'Ghost',
      }).expect(404);
      await patchQuestion(rivertonToken, id, {
        text: 'Stolen',
      }).expect(404);
    });
  });

  describe('delete and restore', () => {
    it('soft deletes, hides and restores a question', async () => {
      const fixture = await createFixture(adminToken);
      const id = fixture['id'] as string;

      await deleteQuestion(adminToken, id).expect(204);

      const hidden = await listQuestions(adminToken).expect(200);

      expect(hidden.body.total).toBe(0);
      expect(hidden.body.summary).toEqual({
        total: 0,
        active: 0,
        inactive: 0,
        deleted: 1,
      });
      await getQuestion(adminToken, id).expect(404);

      const included = await listQuestions(adminToken, {
        includeDeleted: 'true',
      }).expect(200);

      expect(included.body.total).toBe(1);
      expect(typeof included.body.items[0].deletedAt).toBe('string');

      const raw = await questionModel.findById(id).exec();

      expect(raw?.deletedAt).toBeInstanceOf(Date);
      await deleteQuestion(adminToken, id).expect(404);

      const restored = await restoreQuestion(adminToken, id).expect(200);

      expect(restored.body).toMatchObject({
        id,
        deletedAt: null,
        chapterName: 'Number System',
      });

      const visible = await listQuestions(adminToken).expect(200);

      expect(visible.body.total).toBe(1);
      await restoreQuestion(adminToken, id).expect(404);
    });

    it('rejects unknown or live restore requests', async () => {
      const fixture = await createFixture(adminToken);

      await deleteQuestion(adminToken, 'not-an-id').expect(404);
      await deleteQuestion(adminToken, new Types.ObjectId().toString()).expect(
        404,
      );
      await restoreQuestion(adminToken, 'not-an-id').expect(404);
      await restoreQuestion(adminToken, new Types.ObjectId().toString()).expect(
        404,
      );
      await restoreQuestion(adminToken, fixture['id'] as string).expect(404);
    });
  });

  describe('tenant isolation', () => {
    it('keeps questions and references inside the tenant', async () => {
      const rivertonFixture = await createQuestion(rivertonToken, {
        text: 'Riverton question',
        chapterId: rivertonChapter._id.toString(),
        topicId: rivertonTopic._id.toString(),
        questionTypeId: rivertonQuestionType._id.toString(),
        difficultyLevelId: rivertonDifficulty._id.toString(),
        bloomLevelId: null,
        options: [],
        answer: 'Riverton answer',
        marks: 1,
      }).expect(201);

      const greenwoodFixture = await createFixture(adminToken);
      const rivertonList = await listQuestions(rivertonToken).expect(200);
      const greenwoodList = await listQuestions(adminToken).expect(200);

      expect(rivertonList.body.total).toBe(1);
      expect(rivertonList.body.items[0]).toMatchObject({
        id: rivertonFixture.body.id,
        text: 'Riverton question',
        chapterName: 'Riverton Chapter',
        mediumName: 'Kannada',
      });
      expect(greenwoodList.body.total).toBe(1);
      expect(greenwoodList.body.items[0].id).toBe(greenwoodFixture['id']);

      const id = greenwoodFixture['id'] as string;

      await getQuestion(rivertonToken, id).expect(404);
      await patchQuestion(rivertonToken, id, { text: 'Stolen' }).expect(404);
      await deleteQuestion(rivertonToken, id).expect(404);
      await restoreQuestion(rivertonToken, id).expect(404);

      const crossChapter = await createQuestion(rivertonToken, {
        text: 'Cross tenant',
        chapterId: chapterOne._id.toString(),
        topicId: topicOne._id.toString(),
        questionTypeId: rivertonQuestionType._id.toString(),
        difficultyLevelId: rivertonDifficulty._id.toString(),
        options: [],
        answer: 'Answer',
        marks: 1,
      }).expect(404);

      expect(crossChapter.body.message).toContain(
        'Chapter not found or inactive',
      );

      const crossList = await listQuestions(rivertonToken, {
        chapterId: chapterOne._id.toString(),
      }).expect(200);

      expect(crossList.body.total).toBe(0);

      await deleteQuestion(
        rivertonToken,
        rivertonFixture.body.id as string,
      ).expect(204);
      await restoreQuestion(
        adminToken,
        rivertonFixture.body.id as string,
      ).expect(404);
    });
  });
});
