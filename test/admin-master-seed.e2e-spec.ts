import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { Chapter } from '../src/schemas/chapter.schema.js';
import { Medium } from '../src/schemas/medium.schema.js';
import { PlatformAdmin } from '../src/schemas/platform-admin.schema.js';
import { Standard } from '../src/schemas/standard.schema.js';
import { Subject } from '../src/schemas/subject.schema.js';
import { Tenant } from '../src/schemas/tenant.schema.js';
import { Topic } from '../src/schemas/topic.schema.js';
import { User } from '../src/schemas/user.schema.js';

const SUPER_EMAIL = 'owner@papergen.app';
const SUPPORT_EMAIL = 'support@papergen.app';
const PRINCIPAL_EMAIL = 'principal@seed.test';
const PASSWORD = 'Platform@12345';

const TOTALS = {
  mediums: 2,
  standards: 4,
  subjects: 28,
  chapters: 350,
  topics: 1693,
};

let app: INestApplication;
let mongo: MongoMemoryServer;
let seedSchoolId: string;
let seedTenantId: Types.ObjectId;
let mediumModel: Model<Medium>;
let standardModel: Model<Standard>;
let subjectModel: Model<Subject>;
let chapterModel: Model<Chapter>;
let topicModel: Model<Topic>;

function adminLogin(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/admin/auth/login')
    .send({ email, password });
}

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

async function adminToken(email: string): Promise<string> {
  const response = await adminLogin(email, PASSWORD).expect(200);

  return response.body.accessToken as string;
}

async function appToken(email: string): Promise<string> {
  const response = await login(email, PASSWORD).expect(200);

  return response.body.accessToken as string;
}

function seed(token: string, id: string) {
  return request(app.getHttpServer())
    .post(`/api/admin/schools/${id}/seed-master-data`)
    .set('Authorization', `Bearer ${token}`);
}

async function countsFor(tenantId: Types.ObjectId) {
  const [mediums, standards, subjects, chapters, topics] = await Promise.all([
    mediumModel.countDocuments({ tenantId }),
    standardModel.countDocuments({ tenantId }),
    subjectModel.countDocuments({ tenantId }),
    chapterModel.countDocuments({ tenantId }),
    topicModel.countDocuments({ tenantId }),
  ]);

  return { mediums, standards, subjects, chapters, topics };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-master-seed-test');
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
      sendPasswordReset: vi.fn().mockResolvedValue(undefined),
      sendPasswordInvite: vi.fn().mockResolvedValue(undefined),
    })
    .compile();

  app = configureApp(moduleFixture.createNestApplication());
  await app.init();

  const passwordService = app.get(PasswordService);
  const tenantModel = app.get<Model<Tenant>>(getModelToken(Tenant.name));
  const userModel = app.get<Model<User>>(getModelToken(User.name));
  const adminModel = app.get<Model<PlatformAdmin>>(
    getModelToken(PlatformAdmin.name),
  );

  mediumModel = app.get<Model<Medium>>(getModelToken(Medium.name));
  standardModel = app.get<Model<Standard>>(getModelToken(Standard.name));
  subjectModel = app.get<Model<Subject>>(getModelToken(Subject.name));
  chapterModel = app.get<Model<Chapter>>(getModelToken(Chapter.name));
  topicModel = app.get<Model<Topic>>(getModelToken(Topic.name));

  const passwordHash = await passwordService.hash(PASSWORD);

  const seedSchool = await tenantModel.create({
    name: 'Seed Academy',
    slug: 'seed-academy',
    type: 'school',
    city: 'Pune',
    plan: 'growth',
    status: 'active',
  });

  seedSchoolId = seedSchool._id.toString();
  seedTenantId = seedSchool._id;

  await userModel.create({
    tenantId: seedSchool._id,
    email: PRINCIPAL_EMAIL,
    name: 'Seed Principal',
    role: 'school_admin',
    passwordHash,
    status: 'active',
    passwordChangedAt: new Date(),
  });

  await adminModel.create([
    {
      email: SUPER_EMAIL,
      name: 'Platform Owner',
      role: 'super_admin',
      passwordHash,
      status: 'active',
    },
    {
      email: SUPPORT_EMAIL,
      name: 'Platform Support',
      role: 'support',
      passwordHash,
      status: 'active',
    },
  ]);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

describe('Admin master data seed (e2e)', () => {
  it('seeds the full NCERT science dataset for a school', async () => {
    const token = await adminToken(SUPER_EMAIL);
    const response = await seed(token, seedSchoolId).expect(200);
    const body = response.body as Record<string, unknown>;

    expect(body).toMatchObject({
      schoolId: seedSchoolId,
      mediums: { created: TOTALS.mediums, reused: 0 },
      standards: { created: TOTALS.standards, reused: 0 },
      subjects: { created: TOTALS.subjects, reused: 0 },
      chapters: { created: TOTALS.chapters, reused: 0 },
      topics: { created: TOTALS.topics, reused: 0 },
    });
    expect(body['durationMs']).toEqual(expect.any(Number));
    expect(await countsFor(seedTenantId)).toEqual(TOTALS);

    const mediums = await mediumModel.find({ tenantId: seedTenantId });
    const mediumNames = mediums.map((medium) => medium.name).sort();

    expect(mediumNames).toEqual(['English', 'Gujarati']);
    expect(mediums.every((medium) => medium.status === 'active')).toBe(true);

    const standards = await standardModel
      .find({ tenantId: seedTenantId })
      .sort({ order: 1 });

    expect(standards.map((standard) => standard.order)).toEqual([
      11, 11, 12, 12,
    ]);
    expect(standards.map((standard) => standard.name)).toEqual([
      'Std-11',
      'Std-11',
      'Std-12',
      'Std-12',
    ]);

    expect(
      await chapterModel.countDocuments({
        tenantId: seedTenantId,
        referenceType: 'ncert',
      }),
    ).toBe(TOTALS.chapters);

    const gujaratiMedium = mediums.find(
      (medium) => medium.nameKey === 'gujarati',
    );
    const gujaratiStandards = await standardModel.find({
      tenantId: seedTenantId,
      mediumId: gujaratiMedium?._id,
    });
    const gujaratiSubjects = await subjectModel.countDocuments({
      tenantId: seedTenantId,
      standardId: { $in: gujaratiStandards.map((standard) => standard._id) },
    });

    expect(gujaratiSubjects).toBe(14);
  });

  it('is idempotent and reuses every existing record', async () => {
    const token = await adminToken(SUPER_EMAIL);
    const response = await seed(token, seedSchoolId).expect(200);
    const body = response.body as {
      mediums: { created: number; reused: number };
      standards: { created: number; reused: number };
      subjects: { created: number; reused: number };
      chapters: { created: number; reused: number };
      topics: { created: number; reused: number };
    };

    for (const level of [
      'mediums',
      'standards',
      'subjects',
      'chapters',
      'topics',
    ] as const) {
      expect(body[level]).toEqual({
        created: 0,
        reused: TOTALS[level],
      });
    }

    expect(await countsFor(seedTenantId)).toEqual(TOTALS);
  });

  it('restores soft-deleted masters instead of duplicating them', async () => {
    const medium = await mediumModel.findOne({
      tenantId: seedTenantId,
      name: 'English',
    });
    const chapter = await chapterModel.findOne({ tenantId: seedTenantId });

    expect(medium).not.toBeNull();
    expect(chapter).not.toBeNull();

    await mediumModel.updateOne(
      { _id: medium?._id },
      { $set: { deletedAt: new Date() } },
    );
    await chapterModel.updateOne(
      { _id: chapter?._id },
      { $set: { deletedAt: new Date() } },
    );

    const token = await adminToken(SUPER_EMAIL);
    const response = await seed(token, seedSchoolId).expect(200);
    const body = response.body as {
      mediums: { created: number; reused: number };
      chapters: { created: number; reused: number };
    };

    expect(body.mediums).toEqual({ created: 0, reused: TOTALS.mediums });
    expect(body.chapters).toEqual({ created: 0, reused: TOTALS.chapters });
    expect(await countsFor(seedTenantId)).toEqual(TOTALS);

    const restoredMedium = await mediumModel.findById(medium?._id);
    const restoredChapter = await chapterModel.findById(chapter?._id);

    expect(restoredMedium?.deletedAt).toBeNull();
    expect(restoredChapter?.deletedAt).toBeNull();
  });

  it('exposes the seeded masters through the school panel API', async () => {
    const token = await appToken(PRINCIPAL_EMAIL);
    const mediums = await request(app.getHttpServer())
      .get('/api/mediums')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const standards = await request(app.getHttpServer())
      .get('/api/standards')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(mediums.body.total).toBe(TOTALS.mediums);
    expect(
      (mediums.body.items as { name: string }[])
        .map((medium) => medium.name)
        .sort(),
    ).toEqual(['English', 'Gujarati']);
    expect(standards.body.total).toBe(TOTALS.standards);
  });

  it('scopes seeding to the target school only', async () => {
    const tenantModel = app.get<Model<Tenant>>(getModelToken(Tenant.name));
    const other = await tenantModel.create({
      name: 'Other Academy',
      slug: 'other-academy',
      type: 'school',
      city: 'Surat',
      plan: 'starter',
      status: 'active',
    });
    const token = await adminToken(SUPER_EMAIL);

    await seed(token, other._id.toString()).expect(200);

    expect(await countsFor(other._id)).toEqual(TOTALS);
    expect(await countsFor(seedTenantId)).toEqual(TOTALS);
  });

  it('rejects callers without the super admin role', async () => {
    const supportToken = await adminToken(SUPPORT_EMAIL);

    await seed(supportToken, seedSchoolId).expect(403);
    await request(app.getHttpServer())
      .post(`/api/admin/schools/${seedSchoolId}/seed-master-data`)
      .expect(401);

    const token = await adminToken(SUPER_EMAIL);

    await seed(token, new Types.ObjectId().toString()).expect(404);
    await seed(token, 'not-an-object-id').expect(404);
  });
});
