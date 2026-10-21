import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { Tenant } from './tenant.schema.js';

export const EXAM_TYPE_STATUSES = ['active', 'inactive'] as const;

export type ExamTypeStatus = (typeof EXAM_TYPE_STATUSES)[number];

export type ExamTypeDocument = HydratedDocument<ExamType>;

@Schema({ timestamps: true, collection: 'examtypes' })
export class ExamType {
  @Prop({ type: Types.ObjectId, ref: Tenant.name, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true })
  nameKey: string;

  @Prop({ required: true, min: 1, max: 100 })
  order: number;

  @Prop({
    type: String,
    required: true,
    enum: EXAM_TYPE_STATUSES,
    default: 'active',
  })
  status: ExamTypeStatus;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const ExamTypeSchema = SchemaFactory.createForClass(ExamType);

ExamTypeSchema.index({ tenantId: 1, nameKey: 1, deletedAt: 1 });
ExamTypeSchema.index({ tenantId: 1, order: 1 });
