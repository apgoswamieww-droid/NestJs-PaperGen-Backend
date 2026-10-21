import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { Tenant } from './tenant.schema.js';

export const QUESTION_TYPE_STATUSES = ['active', 'inactive'] as const;

export type QuestionTypeStatus = (typeof QUESTION_TYPE_STATUSES)[number];

export type QuestionTypeDocument = HydratedDocument<QuestionType>;

@Schema({ timestamps: true, collection: 'questiontypes' })
export class QuestionType {
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
    enum: QUESTION_TYPE_STATUSES,
    default: 'active',
  })
  status: QuestionTypeStatus;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const QuestionTypeSchema = SchemaFactory.createForClass(QuestionType);

QuestionTypeSchema.index({ tenantId: 1, nameKey: 1, deletedAt: 1 });
QuestionTypeSchema.index({ tenantId: 1, order: 1 });
