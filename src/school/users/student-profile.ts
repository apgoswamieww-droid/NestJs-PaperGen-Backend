import { Types, type Model } from 'mongoose';
import { Medium } from '../../schemas/medium.schema.js';
import { Standard } from '../../schemas/standard.schema.js';
import { Subject } from '../../schemas/subject.schema.js';
import {
  SCIENCE_GROUPS,
  STUDENT_GENDERS,
  STUDENT_STREAMS,
  type ScienceGroup,
  type StudentGender,
  type StudentProfile,
  type StudentStream,
} from '../../schemas/user.schema.js';
import type { StudentProfileRecord } from './school-users.types.js';

const MOBILE_PATTERN = /^[6-9]\d{9}$/;
const AADHAAR_PATTERN = /^\d{12}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface StudentProfileInput {
  surname?: string;
  firstName?: string;
  lastName?: string;
  grNumber?: string;
  rollNumber?: string;
  fatherFullName?: string;
  motherFullName?: string;
  gender?: string;
  dateOfBirth?: string;
  address?: string;
  mobile?: string;
  whatsappNumber?: string;
  stream?: string;
  scienceGroup?: string;
  subjectIds?: string[];
  aadhaarNumber?: string;
  mediumId?: string;
  standardId?: string;
}

export interface StudentProfileReferenceScope {
  mediumIds: ReadonlySet<string>;
  standardIds: ReadonlySet<string>;
  subjectIds: ReadonlySet<string>;
}

export interface StudentProfileDocumentValue {
  surname?: string;
  firstName?: string;
  lastName?: string;
  grNumber?: string;
  rollNumber?: string;
  fatherFullName?: string;
  motherFullName?: string;
  gender?: StudentGender;
  dateOfBirth?: Date;
  address?: string;
  mobile?: string;
  whatsappNumber?: string;
  stream?: StudentStream;
  scienceGroup?: ScienceGroup;
  subjectIds?: Types.ObjectId[];
  aadhaarNumber?: string;
  mediumId?: Types.ObjectId;
  standardId?: Types.ObjectId;
}

export interface StudentProfileBuildResult {
  value: StudentProfileDocumentValue;
  errors: string[];
}

export async function loadStudentProfileScope(
  tenantId: Types.ObjectId,
  subjectModel: Model<Subject>,
  mediumModel: Model<Medium>,
  standardModel: Model<Standard>,
): Promise<StudentProfileReferenceScope> {
  const [subjects, mediums, standards] = await Promise.all([
    subjectModel
      .find({ tenantId, deletedAt: null })
      .select('_id')
      .lean()
      .exec(),
    mediumModel.find({ tenantId, deletedAt: null }).select('_id').lean().exec(),
    standardModel
      .find({ tenantId, deletedAt: null })
      .select('_id')
      .lean()
      .exec(),
  ]);

  return {
    subjectIds: new Set(subjects.map((subject) => String(subject._id))),
    mediumIds: new Set(mediums.map((medium) => String(medium._id))),
    standardIds: new Set(standards.map((standard) => String(standard._id))),
  };
}

export function buildStudentProfile(
  input: StudentProfileInput,
  refs: StudentProfileReferenceScope,
): StudentProfileBuildResult {
  const errors: string[] = [];
  const value: StudentProfileDocumentValue = {};

  const text = (
    field: keyof StudentProfileDocumentValue,
    raw: string | undefined,
    maxLength: number,
  ): void => {
    const trimmed = raw === undefined ? '' : raw.trim();

    if (trimmed === '') {
      return;
    }

    if (trimmed.length > maxLength) {
      errors.push(`${field} must be ${maxLength} characters or fewer.`);
      return;
    }

    (value as Record<string, unknown>)[field] = trimmed;
  };

  text('surname', input.surname, 60);
  text('firstName', input.firstName, 60);
  text('lastName', input.lastName, 60);
  text('grNumber', input.grNumber, 30);
  text('rollNumber', input.rollNumber, 30);
  text('fatherFullName', input.fatherFullName, 120);
  text('motherFullName', input.motherFullName, 120);
  text('address', input.address, 400);

  const gender = input.gender?.trim().toLowerCase() ?? '';

  if (gender !== '') {
    if ((STUDENT_GENDERS as readonly string[]).includes(gender)) {
      value.gender = gender as StudentGender;
    } else {
      errors.push('gender must be male, female or other.');
    }
  }

  const dob = input.dateOfBirth?.trim() ?? '';

  if (dob !== '') {
    const parsed = DATE_PATTERN.test(dob)
      ? new Date(`${dob}T00:00:00.000Z`)
      : null;

    if (parsed === null || Number.isNaN(parsed.getTime())) {
      errors.push('dateOfBirth must be a valid date (YYYY-MM-DD).');
    } else if (parsed.getTime() > Date.now()) {
      errors.push('dateOfBirth cannot be in the future.');
    } else if (parsed.getUTCFullYear() < 1900) {
      errors.push('dateOfBirth must be after 1900.');
    } else {
      value.dateOfBirth = parsed;
    }
  }

  const mobile = input.mobile?.trim() ?? '';

  if (mobile !== '') {
    if (MOBILE_PATTERN.test(mobile)) {
      value.mobile = mobile;
    } else {
      errors.push('mobile must be a 10-digit mobile number.');
    }
  }

  const whatsapp = input.whatsappNumber?.trim() ?? '';

  if (whatsapp !== '') {
    if (MOBILE_PATTERN.test(whatsapp)) {
      value.whatsappNumber = whatsapp;
    } else {
      errors.push('whatsappNumber must be a 10-digit mobile number.');
    }
  }

  const aadhaar = input.aadhaarNumber?.trim() ?? '';

  if (aadhaar !== '') {
    if (AADHAAR_PATTERN.test(aadhaar)) {
      value.aadhaarNumber = aadhaar;
    } else {
      errors.push('aadhaarNumber must be 12 digits.');
    }
  }

  const stream = input.stream?.trim().toLowerCase() ?? '';

  if (stream !== '') {
    if ((STUDENT_STREAMS as readonly string[]).includes(stream)) {
      value.stream = stream as StudentStream;
    } else {
      errors.push('stream must be science, arts, commerce or none.');
    }
  }

  const group = input.scienceGroup?.trim().toLowerCase() ?? '';

  if (group !== '') {
    if (!(SCIENCE_GROUPS as readonly string[]).includes(group)) {
      errors.push('scienceGroup must be a, b or ab.');
    } else if (value.stream !== 'science') {
      errors.push('scienceGroup is only allowed for the Science stream.');
    } else {
      value.scienceGroup = group as ScienceGroup;
    }
  }

  const mediumId = input.mediumId?.trim() ?? '';

  if (mediumId !== '') {
    if (!refs.mediumIds.has(mediumId)) {
      errors.push('mediumId is not a valid medium.');
    } else {
      value.mediumId = new Types.ObjectId(mediumId);
    }
  }

  const standardId = input.standardId?.trim() ?? '';

  if (standardId !== '') {
    if (!refs.standardIds.has(standardId)) {
      errors.push('standardId is not a valid standard.');
    } else {
      value.standardId = new Types.ObjectId(standardId);
    }
  }

  if (input.subjectIds !== undefined) {
    const subjectIds: Types.ObjectId[] = [];

    for (const raw of input.subjectIds) {
      if (!refs.subjectIds.has(raw)) {
        errors.push('subjectIds contains an invalid subject.');
        break;
      }

      subjectIds.push(new Types.ObjectId(raw));
    }

    value.subjectIds = [
      ...new Map(subjectIds.map((id) => [id.toString(), id])).values(),
    ];
  }

  return { value, errors };
}

export function toStudentProfileRecord(
  profile: StudentProfile | null | undefined,
): StudentProfileRecord | null {
  if (!profile) {
    return null;
  }

  return {
    surname: profile.surname ?? '',
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    grNumber: profile.grNumber ?? '',
    rollNumber: profile.rollNumber ?? '',
    fatherFullName: profile.fatherFullName ?? '',
    motherFullName: profile.motherFullName ?? '',
    gender: profile.gender ?? null,
    dateOfBirth: profile.dateOfBirth
      ? profile.dateOfBirth.toISOString().slice(0, 10)
      : null,
    address: profile.address ?? '',
    mobile: profile.mobile ?? '',
    whatsappNumber: profile.whatsappNumber ?? '',
    stream: profile.stream ?? null,
    scienceGroup: profile.scienceGroup ?? null,
    subjectIds: (profile.subjectIds ?? []).map((id) => String(id)),
    aadhaarNumber: profile.aadhaarNumber ?? '',
    mediumId: profile.mediumId ? String(profile.mediumId) : null,
    standardId: profile.standardId ? String(profile.standardId) : null,
  };
}
