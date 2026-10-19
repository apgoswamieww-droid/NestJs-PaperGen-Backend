import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { Tenant } from './tenant.schema.js';

export const USER_ROLES = [
  'school_admin',
  'teacher',
  'staff',
  'student',
] as const;
export const ACCOUNT_STATUSES = ['active', 'suspended'] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ type: Types.ObjectId, ref: Tenant.name, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, default: '' })
  phone: string;

  @Prop({ type: String, required: true, enum: USER_ROLES })
  role: UserRole;

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
