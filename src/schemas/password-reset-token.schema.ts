import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

export const RESET_SUBJECT_TYPES = ['app', 'admin'] as const;

export type ResetSubjectType = (typeof RESET_SUBJECT_TYPES)[number];

export type PasswordResetTokenDocument = HydratedDocument<PasswordResetToken>;

@Schema({ timestamps: true, collection: 'password_reset_tokens' })
export class PasswordResetToken {
  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  subjectId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: RESET_SUBJECT_TYPES })
  subjectType: ResetSubjectType;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  usedAt: Date | null;

  @Prop({ type: String, default: null })
  ip: string | null;

  @Prop({ type: String, default: null })
  userAgent: string | null;
}

export const PasswordResetTokenSchema =
  SchemaFactory.createForClass(PasswordResetToken);

PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
