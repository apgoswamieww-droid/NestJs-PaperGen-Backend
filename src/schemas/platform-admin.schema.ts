import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { ACCOUNT_STATUSES, type AccountStatus } from './user.schema.js';

export const PLATFORM_ADMIN_ROLES = ['super_admin', 'support'] as const;

export type PlatformAdminRole = (typeof PLATFORM_ADMIN_ROLES)[number];

export type PlatformAdminDocument = HydratedDocument<PlatformAdmin>;

@Schema({ timestamps: true, collection: 'platform_admins' })
export class PlatformAdmin {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    type: String,
    required: true,
    enum: PLATFORM_ADMIN_ROLES,
    default: 'support',
  })
  role: PlatformAdminRole;

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

export const PlatformAdminSchema = SchemaFactory.createForClass(PlatformAdmin);
