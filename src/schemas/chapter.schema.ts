import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { Subject } from './subject.schema.js';
import { Tenant } from './tenant.schema.js';

export const CHAPTER_STATUSES = ['active', 'inactive'] as const;
export const CHAPTER_REFERENCE_TYPES = ['ncert', 'other'] as const;

export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];
export type ChapterReferenceType = (typeof CHAPTER_REFERENCE_TYPES)[number];

export type ChapterDocument = HydratedDocument<Chapter>;

@Schema({ timestamps: true, collection: 'chapters' })
export class Chapter {
  @Prop({ type: Types.ObjectId, ref: Tenant.name, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: Subject.name,
    required: true,
    index: true,
  })
  subjectId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true })
  nameKey: string;

  @Prop({
    type: String,
    required: true,
    enum: CHAPTER_REFERENCE_TYPES,
    default: 'ncert',
  })
  referenceType: ChapterReferenceType;

  @Prop({ required: true, min: 1, max: 100 })
  order: number;

  @Prop({
    type: String,
    required: true,
    enum: CHAPTER_STATUSES,
    default: 'active',
  })
  status: ChapterStatus;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const ChapterSchema = SchemaFactory.createForClass(Chapter);

ChapterSchema.index({ tenantId: 1, subjectId: 1, nameKey: 1, deletedAt: 1 });
ChapterSchema.index({ tenantId: 1, order: 1 });
