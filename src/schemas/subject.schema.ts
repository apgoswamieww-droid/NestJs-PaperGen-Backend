import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { Standard } from './standard.schema.js';
import { Tenant } from './tenant.schema.js';

export const SUBJECT_STATUSES = ['active', 'inactive'] as const;

export type SubjectStatus = (typeof SUBJECT_STATUSES)[number];

export type SubjectDocument = HydratedDocument<Subject>;

@Schema({ timestamps: true, collection: 'subjects' })
export class Subject {
  @Prop({ type: Types.ObjectId, ref: Tenant.name, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: Standard.name,
    required: true,
    index: true,
  })
  standardId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true })
  nameKey: string;

  @Prop({ required: true, min: 1, max: 100 })
  order: number;

  @Prop({
    type: String,
    required: true,
    enum: SUBJECT_STATUSES,
    default: 'active',
  })
  status: SubjectStatus;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const SubjectSchema = SchemaFactory.createForClass(Subject);

SubjectSchema.index({ tenantId: 1, standardId: 1, nameKey: 1, deletedAt: 1 });
SubjectSchema.index({ tenantId: 1, order: 1 });
