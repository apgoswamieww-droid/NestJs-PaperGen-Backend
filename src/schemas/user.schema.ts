import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { Medium } from './medium.schema.js';
import { Standard } from './standard.schema.js';
import { Subject } from './subject.schema.js';
import { Tenant } from './tenant.schema.js';

export const USER_ROLES = [
  'school_admin',
  'teacher',
  'staff',
  'student',
] as const;
export const ACCOUNT_STATUSES = ['active', 'suspended'] as const;
export const STUDENT_GENDERS = ['male', 'female', 'other'] as const;
export const STUDENT_STREAMS = ['science', 'arts', 'commerce', 'none'] as const;
export const SCIENCE_GROUPS = ['a', 'b', 'ab'] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export type StudentGender = (typeof STUDENT_GENDERS)[number];
export type StudentStream = (typeof STUDENT_STREAMS)[number];
export type ScienceGroup = (typeof SCIENCE_GROUPS)[number];

export type UserDocument = HydratedDocument<User>;

@Schema({ _id: false })
export class StudentProfile {
  @Prop({ type: String, trim: true, default: '' })
  surname: string;

  @Prop({ type: String, trim: true, default: '' })
  firstName: string;

  @Prop({ type: String, trim: true, default: '' })
  lastName: string;

  @Prop({ type: String, trim: true, default: '' })
  grNumber: string;

  @Prop({ type: String, trim: true, default: '' })
  rollNumber: string;

  @Prop({ type: String, trim: true, default: '' })
  fatherFullName: string;

  @Prop({ type: String, trim: true, default: '' })
  motherFullName: string;

  @Prop({ type: String, enum: STUDENT_GENDERS, default: null })
  gender: StudentGender | null;

  @Prop({ type: Date, default: null })
  dateOfBirth: Date | null;

  @Prop({ type: String, trim: true, default: '' })
  address: string;

  @Prop({ type: String, trim: true, default: '' })
  mobile: string;

  @Prop({ type: String, trim: true, default: '' })
  whatsappNumber: string;

  @Prop({ type: String, enum: STUDENT_STREAMS, default: null })
  stream: StudentStream | null;

  @Prop({ type: String, enum: SCIENCE_GROUPS, default: null })
  scienceGroup: ScienceGroup | null;

  @Prop({ type: [Types.ObjectId], ref: Subject.name, default: [] })
  subjectIds: Types.ObjectId[];

  @Prop({ type: String, trim: true, default: '' })
  aadhaarNumber: string;

  @Prop({ type: Types.ObjectId, ref: Medium.name, default: null })
  mediumId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: Standard.name, default: null })
  standardId: Types.ObjectId | null;
}

export const StudentProfileSchema =
  SchemaFactory.createForClass(StudentProfile);

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ type: Types.ObjectId, ref: Tenant.name, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: String, lowercase: true, trim: true, default: null })
  email: string | null;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, default: '' })
  phone: string;

  @Prop({ required: true, trim: true })
  role: string;

  @Prop({ type: StudentProfileSchema, default: null })
  studentProfile: StudentProfile | null;

  @Prop({ type: String, required: true, select: false })
  passwordHash: string;

  @Prop({
    type: String,
    required: true,
    enum: ACCOUNT_STATUSES,
    default: 'active',
  })
  status: AccountStatus;

  @Prop({ required: true, default: 0 })
  failedAttempts: number;

  @Prop({ type: Date, default: null })
  lockedUntil: Date | null;

  @Prop({ type: Date, default: null })
  lastLoginAt: Date | null;

  @Prop({ type: Date, default: null })
  passwordChangedAt: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index(
  { email: 1 },
  {
    unique: true,
    name: 'email_partial_unique',
    partialFilterExpression: { email: { $type: 'string' } },
  },
);
