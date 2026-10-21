import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service.js';
import { RolePermissionsService } from '../src/auth/role-permissions.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { Medium } from '../src/schemas/medium.schema.js';
import { Standard } from '../src/schemas/standard.schema.js';
import { Subject } from '../src/schemas/subject.schema.js';
import { Tenant } from '../src/schemas/tenant.schema.js';
import { User } from '../src/schemas/user.schema.js';

const PASSWORD = 'School@12345';
const PRINCIPAL_EMAIL = 'principal@greenwood.test';
const TEACHER_EMAIL = 'teacher@greenwood.test';
const EXISTING_STUDENT_EMAIL = 'existing.student@greenwood.test';
const RIVERTON_PRINCIPAL_EMAIL = 'principal@riverton.test';

const COLUMNS = [
  'first_name',
  'surname',
  'last_name',
  'gr_number',
  'roll_number',
  'standard',
  'father_full_name',
  'mother_full_name',
  'gender',
  'dob',
  'address',
  'mobile',
  'email',
  'whatsapp_no',
  'stream',
  'science_group',
  'subjects',
  'aadhaar_number',
  'medium',
] as const;

type Column = (typeof COLUMNS)[number];

let app: INestApplication;
let mongo: MongoMemoryServer;
let sendCredentials: ReturnType<typeof vi.fn>;
let userModel: Model<User>;
let subjectModel: Model<Subject>;
let mediumModel: Model<Medium>;
let scienceId: string;
let mathsId: string;
let englishId: string;
let standardId: string;

function login(email: string, password: string) {
  return request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password, remember: false });
}

async function appToken(email: string, password: string): Promise<string> {
  const response = await login(email, password).expect(200);

  return response.body.accessToken as string;
}

function createUser(token: string, payload: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post('/api/users')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function patchUser(
  token: string,
  id: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .patch(`/api/users/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

function userDetail(token: string, id: string) {
  return request(app.getHttpServer())
    .get(`/api/users/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

function importStudents(token: string, csv: string) {
  return request(app.getHttpServer())
    .post('/api/users/import')
    .set('Authorization', `Bearer ${token}`)
    .send({ csv });
}

function importTemplate(token: string) {
  return request(app.getHttpServer())
    .get('/api/users/import-template')
    .set('Authorization', `Bearer ${token}`)
    .parse((response, callback) => {
      const chunks: Buffer[] = [];

      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
}

function csvLine(values: Partial<Record<Column, string>>): string {
  return COLUMNS.map((column) => {
    const value = values[column] ?? '';

    return value.includes(',') || value.includes('"')
      ? `"${value.replace(/"/g, '""')}"`
      : value;
  }).join(',');
}

function csvFile(...rows: string[]): string {
  return [COLUMNS.join(','), ...rows].join('\n') + '\n';
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env['NODE_ENV'] = 'test';
  process.env['MONGODB_URI'] = mongo.getUri('papergen-student-import-test');
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

  sendCredentials = vi.fn().mockResolvedValue(undefined);

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MailService)
    .useValue({
      sendCredentials,
      sendPasswordReset: vi.fn().mockResolvedValue(undefined),
      sendPasswordInvite: vi.fn().mockResolvedValue(undefined),
    })
    .compile();

  app = configureApp(moduleFixture.createNestApplication());
  await app.init();

  const passwordService = app.get(PasswordService);
  const tenantModel = app.get<Model<Tenant>>(getModelToken(Tenant.name));

  userModel = app.get<Model<User>>(getModelToken(User.name));
  subjectModel = app.get<Model<Subject>>(getModelToken(Subject.name));
  mediumModel = app.get<Model<Medium>>(getModelToken(Medium.name));
  const standardModel = app.get<Model<Standard>>(getModelToken(Standard.name));
  const rolePermissions = app.get(RolePermissionsService);

  const passwordHash = await passwordService.hash(PASSWORD);

  const greenwood = await tenantModel.create({
    name: 'Greenwood High',
    slug: 'greenwood-import',
    type: 'school',
    plan: 'growth',
    status: 'active',
  });
  const riverton = await tenantModel.create({
    name: 'Riverton School',
    slug: 'riverton-import',
    type: 'school',
    plan: 'starter',
    status: 'active',
  });

  await userModel.create([
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
      tenantId: greenwood._id,
      name: 'Esha Kulkarni',
      email: EXISTING_STUDENT_EMAIL,
      role: 'student',
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

  await rolePermissions.ensureSystemRoles(greenwood._id);
  await rolePermissions.ensureSystemRoles(riverton._id);

  const english = await mediumModel.create({
    tenantId: greenwood._id,
    name: 'English',
    nameKey: 'english',
  });
  const marathi = await mediumModel.create({
    tenantId: riverton._id,
    name: 'Marathi',
    nameKey: 'marathi',
  });
  englishId = english._id.toString();

  const standard = await standardModel.create({
    tenantId: greenwood._id,
    mediumId: english._id,
    name: 'Class 10',
    nameKey: 'class 10',
    order: 1,
  });
  const rivertonStandard = await standardModel.create({
    tenantId: riverton._id,
    mediumId: marathi._id,
    name: 'Class 10',
    nameKey: 'class 10',
    order: 1,
  });
  standardId = standard._id.toString();

  const science = await subjectModel.create({
    tenantId: greenwood._id,
    standardId: standard._id,
    name: 'Science',
    nameKey: 'science',
    order: 1,
  });
  const maths = await subjectModel.create({
    tenantId: greenwood._id,
    standardId: standard._id,
    name: 'Mathematics',
    nameKey: 'maths',
    order: 2,
  });
  await subjectModel.create({
    tenantId: riverton._id,
    standardId: rivertonStandard._id,
    name: 'Physics',
    nameKey: 'physics',
    order: 1,
  });
  scienceId = science._id.toString();
  mathsId = maths._id.toString();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

describe('Student import (e2e)', () => {
  describe('template', () => {
    it('serves the student import template to users managers', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await importTemplate(token).expect(200);

      expect(response.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(response.headers['content-disposition']).toContain(
        'student-import-template.xlsx',
      );

      const workbook = new ExcelJS.Workbook();

      await workbook.xlsx.load(response.body as unknown as ArrayBuffer);

      const sheet = workbook.getWorksheet('Students');
      const header = sheet?.getRow(1).values as (string | undefined)[];
      const list = workbook.getWorksheet('Standards');

      expect(header.slice(1)).toEqual([...COLUMNS]);
      expect(list?.state).toBe('hidden');
      expect(list?.getCell('A1').value).toBe('Class 10');

      const validations = (
        sheet as unknown as {
          dataValidations: {
            model: Record<string, { formulae?: string[] }>;
          };
        }
      ).dataValidations.model;

      expect(Object.keys(validations)).toHaveLength(100);
      expect(validations['F2']?.formulae).toEqual(['StandardList']);
      expect(validations['F101']?.formulae).toEqual(['StandardList']);
    });

    it('rejects template downloads and imports without users.manage', async () => {
      const teacherToken = await appToken(TEACHER_EMAIL, PASSWORD);

      await importTemplate(teacherToken).expect(403);
      await importStudents(teacherToken, csvFile()).expect(403);
      await request(app.getHttpServer())
        .get('/api/users/import-template')
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/users/import')
        .send({ csv: csvFile() })
        .expect(401);
    });
  });

  describe('bulk import', () => {
    it('imports students with profiles and reports every row', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const mailsBefore = sendCredentials.mock.calls.length;
      const response = await importStudents(
        token,
        csvFile(
          csvLine({
            first_name: 'Aarav',
            surname: 'Patil',
            gr_number: 'GR-2026-001',
            roll_number: '17',
            standard: 'Class 10',
            father_full_name: 'Ramesh Patil',
            mother_full_name: 'Sunita Patil',
            gender: 'male',
            dob: '2010-06-15',
            address: '12 Lake Road, Pune',
            mobile: '9876543210',
            email: 'aarav@greenwood.test',
            whatsapp_no: '9876543211',
            stream: 'science',
            science_group: 'ab',
            subjects: 'science;maths',
            aadhaar_number: '123456789012',
            medium: 'English',
          }),
          csvLine({
            first_name: 'Isha',
            surname: 'Kulkarni',
            gender: 'female',
            stream: 'arts',
            subjects: 'maths',
          }),
          csvLine({ first_name: 'Broken', email: 'not-an-email' }),
        ),
      ).expect(200);

      expect(response.body).toMatchObject({
        total: 3,
        created: 2,
        failed: 1,
      });

      const results = response.body.results as {
        row: number;
        name: string;
        email: string;
        status: string;
        error: string | null;
        password: string | null;
      }[];
      const created = results[0];

      expect(created).toMatchObject({
        row: 1,
        name: 'Aarav Patil',
        email: 'aarav@greenwood.test',
        status: 'created',
        error: null,
      });
      expect(created?.password).toHaveLength(14);
      expect(results[2]).toMatchObject({
        row: 3,
        status: 'failed',
        error: 'email is not valid.',
        password: null,
      });

      expect(sendCredentials.mock.calls.length).toBe(mailsBefore);

      const aarav = await userModel
        .findOne({ email: 'aarav@greenwood.test' })
        .exec();
      const isha = await userModel
        .findOne({ name: 'Isha Kulkarni' })
        .select('+passwordHash')
        .exec();

      expect(aarav?.role).toBe('student');
      expect(aarav?.studentProfile).toMatchObject({
        firstName: 'Aarav',
        surname: 'Patil',
        grNumber: 'GR-2026-001',
        rollNumber: '17',
        gender: 'male',
        stream: 'science',
        scienceGroup: 'ab',
        mobile: '9876543210',
        whatsappNumber: '9876543211',
        aadhaarNumber: '123456789012',
        address: '12 Lake Road, Pune',
      });
      expect(
        aarav?.studentProfile?.subjectIds.map((id) => id.toString()).sort(),
      ).toEqual([scienceId, mathsId].sort());
      expect(aarav?.studentProfile?.mediumId?.toString()).toBe(englishId);
      expect(aarav?.studentProfile?.standardId?.toString()).toBe(standardId);
      expect(aarav?.studentProfile?.dateOfBirth?.toISOString()).toBe(
        '2010-06-15T00:00:00.000Z',
      );
      expect(isha?.email).toBeNull();
      expect(isha?.studentProfile?.stream).toBe('arts');

      const password = created.password;

      if (password === null) {
        throw new Error('The created student did not receive a password.');
      }

      const signedIn = await login('aarav@greenwood.test', password).expect(
        200,
      );

      expect(signedIn.body.user.role).toBe('student');
    });

    it('reports duplicate, existing and unknown master values', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const response = await importStudents(
        token,
        csvFile(
          csvLine({
            first_name: 'Duplicate',
            email: 'duplicate@greenwood.test',
          }),
          csvLine({
            first_name: 'Duplicate Again',
            email: 'duplicate@greenwood.test',
          }),
          csvLine({
            first_name: 'Already Here',
            email: EXISTING_STUDENT_EMAIL,
          }),
          csvLine({
            first_name: 'Unknown Subject',
            subjects: 'Science;Rocket Science',
          }),
          csvLine({
            first_name: 'Unknown Medium',
            medium: 'Klingon',
          }),
          csvLine({
            first_name: 'Unknown Standard',
            standard: 'Class 99',
          }),
          csvLine({
            first_name: 'Wrong Group',
            stream: 'commerce',
            science_group: 'a',
          }),
        ),
      ).expect(200);

      expect(response.body).toMatchObject({
        total: 7,
        created: 1,
        failed: 6,
      });

      const results = response.body.results as {
        row: number;
        status: string;
        error: string | null;
      }[];

      expect(results.map((result) => result.status)).toEqual([
        'created',
        'failed',
        'failed',
        'failed',
        'failed',
        'failed',
        'failed',
      ]);
      expect(results[1]?.error).toBe('Duplicate email in this file.');
      expect(results[2]?.error).toBe('A user with this email already exists.');
      expect(results[3]?.error).toBe('Unknown subject "Rocket Science".');
      expect(results[4]?.error).toBe('Unknown medium "Klingon".');
      expect(results[5]?.error).toBe('Unknown standard "Class 99".');
      expect(results[6]?.error).toBe(
        'scienceGroup is only allowed for the Science stream.',
      );
    });

    it('requires the first_name header and a non-empty file', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const empty = await importStudents(token, '').expect(400);
      expect(empty.body.message).toBe('The import file is empty.');

      const missing = await importStudents(
        token,
        'name,email\nAarav,aarav2@greenwood.test\n',
      ).expect(400);
      expect(missing.body.message).toContain('first_name');

      const noFirstName = await importStudents(
        token,
        csvFile(csvLine({ surname: 'Patil' })),
      ).expect(200);

      expect(noFirstName.body.results[0]).toMatchObject({
        status: 'failed',
        error: 'first_name is required.',
      });
    });

    it('limits the file to 100 students', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const rows = Array.from({ length: 101 }, (_, index) =>
        csvLine({ first_name: `Student ${index}` }),
      );

      const response = await importStudents(token, csvFile(...rows)).expect(
        400,
      );

      expect(response.body.message).toBe(
        'Import is limited to 100 students per file.',
      );
    });

    it('resolves masters within the caller tenant only', async () => {
      const greenwoodToken = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const rivertonToken = await appToken(RIVERTON_PRINCIPAL_EMAIL, PASSWORD);

      const wrongTenant = await importStudents(
        greenwoodToken,
        csvFile(
          csvLine({
            first_name: 'Cross Tenant',
            subjects: 'physics',
            medium: 'marathi',
          }),
        ),
      ).expect(200);

      expect(wrongTenant.body.results[0]).toMatchObject({
        status: 'failed',
        error: 'Unknown subject "physics".',
      });

      const ownTenant = await importStudents(
        rivertonToken,
        csvFile(
          csvLine({
            first_name: 'Veena',
            surname: 'Rathod',
            subjects: 'physics',
            medium: 'marathi',
            stream: 'science',
            science_group: 'b',
          }),
        ),
      ).expect(200);

      expect(ownTenant.body).toMatchObject({ total: 1, created: 1 });
    });
  });

  describe('student profiles through the users API', () => {
    it('creates students without email, even when several have none', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const mailsBefore = sendCredentials.mock.calls.length;

      const first = await createUser(token, {
        name: 'No Email One',
        role: 'student',
      }).expect(201);
      const second = await createUser(token, {
        name: 'No Email Two',
        role: 'student',
        email: '',
      }).expect(201);

      for (const response of [first, second]) {
        expect(response.body.user).toMatchObject({
          role: 'student',
          email: '',
          studentProfile: null,
        });
        expect(response.body.credentials).toEqual({
          email: '',
          password: expect.any(String),
          sent: false,
        });
      }

      expect(sendCredentials.mock.calls.length).toBe(mailsBefore);
    });

    it('creates, returns and replaces a full student profile', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const created = await createUser(token, {
        name: 'Kabir Rao',
        role: 'student',
        email: 'kabir@greenwood.test',
        studentProfile: {
          firstName: 'Kabir',
          surname: 'Rao',
          lastName: 'Rao',
          grNumber: 'GR-2026-017',
          rollNumber: '21',
          fatherFullName: 'Mohan Rao',
          motherFullName: 'Lata Rao',
          gender: 'male',
          dateOfBirth: '2011-01-20',
          address: '5 Hill View',
          mobile: '9123456780',
          whatsappNumber: '9123456781',
          stream: 'science',
          scienceGroup: 'ab',
          subjectIds: [scienceId, mathsId],
          aadhaarNumber: '987654321012',
          mediumId: englishId,
          standardId,
        },
      }).expect(201);

      expect(created.body.user.studentProfile).toMatchObject({
        firstName: 'Kabir',
        surname: 'Rao',
        grNumber: 'GR-2026-017',
        rollNumber: '21',
        gender: 'male',
        dateOfBirth: '2011-01-20',
        stream: 'science',
        scienceGroup: 'ab',
        mediumId: englishId,
        standardId,
      });

      const id = created.body.user.id as string;
      const detail = await userDetail(token, id).expect(200);

      expect(detail.body.studentProfile.subjectIds.sort()).toEqual(
        [scienceId, mathsId].sort(),
      );

      const updated = await patchUser(token, id, {
        studentProfile: {
          firstName: 'Kabir',
          surname: 'Rao',
          stream: 'commerce',
        },
      }).expect(200);

      expect(updated.body.studentProfile).toMatchObject({
        firstName: 'Kabir',
        stream: 'commerce',
        grNumber: '',
        rollNumber: '',
        scienceGroup: null,
        mediumId: null,
        standardId: null,
        subjectIds: [],
        gender: null,
        dateOfBirth: null,
      });
    });

    it('validates profile references and cross-field rules', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);

      const badSubject = await createUser(token, {
        name: 'Bad Subject',
        role: 'student',
        studentProfile: { subjectIds: [new Types.ObjectId().toString()] },
      }).expect(400);

      expect(badSubject.body.message).toContain('invalid subject');

      const badAadhaar = await createUser(token, {
        name: 'Bad Aadhaar',
        role: 'student',
        studentProfile: { aadhaarNumber: '123' },
      }).expect(400);

      expect(badAadhaar.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('aadhaarNumber')]),
      );

      const badGroup = await createUser(token, {
        name: 'Bad Group',
        role: 'student',
        studentProfile: { stream: 'arts', scienceGroup: 'a' },
      }).expect(400);

      expect(badGroup.body.message).toBe(
        'scienceGroup is only allowed for the Science stream.',
      );
    });

    it('keeps email mandatory for non-student accounts', async () => {
      const token = await appToken(PRINCIPAL_EMAIL, PASSWORD);
      const teacher = await userModel.findOne({ email: TEACHER_EMAIL }).exec();

      if (!teacher) {
        throw new Error('Teacher fixture missing.');
      }

      const response = await patchUser(token, teacher._id.toString(), {
        email: '',
      }).expect(400);

      expect(response.body.message).toBe(
        'Email is required for non-student accounts.',
      );
    });
  });
});
