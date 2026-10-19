import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

export const REFRESH_SUBJECT_TYPES = ['app', 'admin'] as const;

export type RefreshSubjectType = (typeof REFRESH_SUBJECT_TYPES)[number];

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

@Schema({ timestamps: true, collection: 'refresh_tokens' })
export class RefreshToken {
  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  subjectId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: REFRESH_SUBJECT_TYPES })
  subjectType: RefreshSubjectType;

  @Prop({ required: true, index: true })
  familyId: string;

  @Prop({ required: true, default: false })
  remember: boolean;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;

  @Prop({ type: String, default: null })
  replacedByHash: string | null;

  @Prop({ type: String, default: null })
  ip: string | null;

  @Prop({ type: String, default: null })
  userAgent: string | null;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
