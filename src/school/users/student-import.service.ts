import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import ExcelJS, { type DataValidation } from 'exceljs';
import { Types, type Model } from 'mongoose';
import type { AuthIdentity } from '../../auth/auth.types.js';
import { PasswordService } from '../../auth/password.service.js';
import { Medium } from '../../schemas/medium.schema.js';
import { Standard } from '../../schemas/standard.schema.js';
import { Subject } from '../../schemas/subject.schema.js';
import { User } from '../../schemas/user.schema.js';
import { normalizeHeader, parseCsv } from './csv.js';
import type { ImportStudentsDto } from './dto/import-students.dto.js';
import {
  buildStudentProfile,
  type StudentProfileInput,
} from './student-profile.js';
import type {
  StudentImportResult,
  StudentImportRowResult,
} from './school-users.types.js';

export const STUDENT_IMPORT_COLUMNS = [
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

const MAX_IMPORT_ROWS = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STANDARD_COLUMN_INDEX = STUDENT_IMPORT_COLUMNS.indexOf('standard') + 1;

interface WorksheetValidations {
  dataValidations: {
    add(range: string, validation: DataValidation): void;
  };
}

@Injectable()
export class StudentImportService {
  constructor(
    private readonly passwordService: PasswordService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Subject.name) private readonly subjectModel: Model<Subject>,
    @InjectModel(Medium.name) private readonly mediumModel: Model<Medium>,
    @InjectModel(Standard.name)
    private readonly standardModel: Model<Standard>,
  ) {}

  async template(auth: AuthIdentity): Promise<Buffer> {
    const tenantId = this.tenantId(auth);
    const standards = await this.standardModel
      .find({ tenantId, deletedAt: null, status: 'active' })
      .select('name')
      .sort({ order: 1, name: 1 })
      .lean()
      .exec();
    const standardNames = [
      ...new Set(
        standards
          .map((standard) => standard.name.trim())
          .filter((name) => name !== ''),
      ),
    ];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Students');
    const header = sheet.addRow([...STUDENT_IMPORT_COLUMNS]);

    header.font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns = STUDENT_IMPORT_COLUMNS.map(() => ({ width: 20 }));

    if (standardNames.length > 0) {
      const list = workbook.addWorksheet('Standards', { state: 'hidden' });

      standardNames.forEach((name, index) => {
        list.getCell(index + 1, 1).value = name;
      });

      workbook.definedNames.add(
        `Standards!$A$1:$A$${standardNames.length}`,
        'StandardList',
      );

      const column = sheet.getColumn(STANDARD_COLUMN_INDEX).letter;

      (sheet as unknown as WorksheetValidations).dataValidations.add(
        `${column}2:${column}${MAX_IMPORT_ROWS + 1}`,
        {
          type: 'list',
          allowBlank: true,
          showErrorMessage: true,
          errorTitle: 'Choose a standard',
          error: 'Pick a standard from the list.',
          formulae: ['StandardList'],
        },
      );
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async importStudents(
    auth: AuthIdentity,
    dto: ImportStudentsDto,
  ): Promise<StudentImportResult> {
    const tenantId = this.tenantId(auth);
    const rows = parseCsv(dto.csv);

    const headerRowIndex = rows.findIndex((row) =>
      row.some((cell) => cell.trim() !== ''),
    );

    if (headerRowIndex === -1) {
      throw new BadRequestException('The import file is empty.');
    }

    const header = rows[headerRowIndex] ?? [];
    const headerIndex = new Map<string, number>();

    header.forEach((cell, index) => {
      const key = normalizeHeader(cell);

      if (key !== '' && !headerIndex.has(key)) {
        headerIndex.set(key, index);
      }
    });

    if (!headerIndex.has('first_name')) {
      throw new BadRequestException(
        'The import header must include first_name. Download the template for the expected columns.',
      );
    }

    const dataRows = rows.slice(headerRowIndex + 1);

    if (dataRows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `Import is limited to ${MAX_IMPORT_ROWS} students per file.`,
      );
    }

    const [subjects, mediums, standards] = await Promise.all([
      this.subjectModel
        .find({ tenantId, deletedAt: null })
        .select('_id name nameKey')
        .lean()
        .exec(),
      this.mediumModel
        .find({ tenantId, deletedAt: null })
        .select('_id name nameKey')
        .lean()
        .exec(),
      this.standardModel
        .find({ tenantId, deletedAt: null })
        .select('_id name nameKey')
        .lean()
        .exec(),
    ]);

    const subjectIds = new Map<string, Types.ObjectId>();
    const mediumIds = new Map<string, Types.ObjectId>();
    const standardIds = new Map<string, Types.ObjectId>();

    for (const subject of subjects) {
      subjectIds.set(subject.nameKey, subject._id);
      subjectIds.set(subject.name.trim().toLowerCase(), subject._id);
    }

    for (const medium of mediums) {
      mediumIds.set(medium.nameKey, medium._id);
      mediumIds.set(medium.name.trim().toLowerCase(), medium._id);
    }

    for (const standard of standards) {
      standardIds.set(standard.nameKey, standard._id);
      standardIds.set(standard.name.trim().toLowerCase(), standard._id);
    }

    const scope = {
      subjectIds: new Set(subjects.map((subject) => String(subject._id))),
      mediumIds: new Set(mediums.map((medium) => String(medium._id))),
      standardIds: new Set(standards.map((standard) => String(standard._id))),
    };

    const value = (row: string[], ...names: string[]): string => {
      for (const name of names) {
        const index = headerIndex.get(name);

        if (index !== undefined) {
          return (row[index] ?? '').trim();
        }
      }

      return '';
    };

    const emailRows = dataRows.map((row) => value(row, 'email').toLowerCase());
    const requestedEmails = [...new Set(emailRows.filter((email) => email))];
    const existingEmails = new Set<string>();

    if (requestedEmails.length > 0) {
      const existing = await this.userModel
        .find({ email: { $in: requestedEmails } })
        .select('email')
        .lean()
        .exec();

      for (const user of existing) {
        if (typeof user.email === 'string') {
          existingEmails.add(user.email);
        }
      }
    }

    const seenEmails = new Set<string>();
    const results: StudentImportRowResult[] = [];

    for (const [index, row] of dataRows.entries()) {
      const rowNumber = index + 1;
      const email = emailRows[index] ?? '';
      const firstName = value(row, 'first_name');
      const lastName = value(row, 'last_name');
      const surname = value(row, 'surname');
      const displayName = [firstName, lastName || surname]
        .filter((part) => part !== '')
        .join(' ');

      if (row.every((cell) => cell.trim() === '')) {
        continue;
      }

      const fail = (error: string): void => {
        results.push({
          row: rowNumber,
          name: displayName,
          email,
          status: 'failed',
          error,
          password: null,
        });
      };

      if (firstName === '') {
        fail('first_name is required.');
        continue;
      }

      if (email !== '' && !EMAIL_PATTERN.test(email)) {
        fail('email is not valid.');
        continue;
      }

      if (email !== '') {
        if (existingEmails.has(email)) {
          fail('A user with this email already exists.');
          continue;
        }

        if (seenEmails.has(email)) {
          fail('Duplicate email in this file.');
          continue;
        }
      }

      const subjectNames = value(row, 'subjects')
        .split(/[;,]/)
        .map((name) => name.trim())
        .filter((name) => name !== '');
      const resolvedSubjects: string[] = [];
      let subjectError: string | null = null;

      for (const name of subjectNames) {
        const id = subjectIds.get(name.toLowerCase());

        if (!id) {
          subjectError = `Unknown subject "${name}".`;
          break;
        }

        resolvedSubjects.push(String(id));
      }

      if (subjectError) {
        fail(subjectError);
        continue;
      }

      const mediumName = value(row, 'medium').toLowerCase();
      const mediumId =
        mediumName === '' ? undefined : mediumIds.get(mediumName);

      if (mediumName !== '' && !mediumId) {
        fail(`Unknown medium "${value(row, 'medium')}".`);
        continue;
      }

      const standardName = value(row, 'standard').toLowerCase();
      const standardId =
        standardName === '' ? undefined : standardIds.get(standardName);

      if (standardName !== '' && !standardId) {
        fail(`Unknown standard "${value(row, 'standard')}".`);
        continue;
      }

      const profileInput: StudentProfileInput = {
        firstName,
        lastName,
        surname,
        grNumber: value(row, 'gr_number', 'gr_no', 'grno'),
        rollNumber: value(row, 'roll_number', 'roll_no', 'rollno'),
        fatherFullName: value(row, 'father_full_name'),
        motherFullName: value(row, 'mother_full_name'),
        gender: value(row, 'gender'),
        dateOfBirth: value(row, 'dob', 'date_of_birth'),
        address: value(row, 'address'),
        mobile: value(row, 'mobile'),
        whatsappNumber: value(row, 'whatsapp_no', 'whatsapp_number'),
        stream: value(row, 'stream'),
        scienceGroup: value(row, 'science_group'),
        subjectIds: resolvedSubjects,
        aadhaarNumber: value(row, 'aadhaar_number'),
        mediumId: mediumId ? String(mediumId) : undefined,
        standardId: standardId ? String(standardId) : undefined,
      };
      const { value: profile, errors } = buildStudentProfile(
        profileInput,
        scope,
      );

      if (errors.length > 0) {
        fail(errors.join(' '));
        continue;
      }

      const password = this.passwordService.generate();

      try {
        await this.userModel.create({
          tenantId,
          name: displayName,
          email: email === '' ? null : email,
          phone: '',
          role: 'student',
          studentProfile: profile,
          passwordHash: await this.passwordService.hash(password),
          status: 'active',
          passwordChangedAt: new Date(),
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          fail('A user with this email already exists.');
        } else {
          fail('The student could not be saved.');
        }

        continue;
      }

      if (email !== '') {
        seenEmails.add(email);
      }

      results.push({
        row: rowNumber,
        name: displayName,
        email,
        status: 'created',
        error: null,
        password,
      });
    }

    const created = results.filter((row) => row.status === 'created').length;

    return {
      total: results.length,
      created,
      failed: results.length - created,
      results,
    };
  }

  private tenantId(auth: AuthIdentity): Types.ObjectId {
    if (!auth.tenantId || !Types.ObjectId.isValid(auth.tenantId)) {
      throw new UnauthorizedException('Tenant context missing.');
    }

    return new Types.ObjectId(auth.tenantId);
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}
