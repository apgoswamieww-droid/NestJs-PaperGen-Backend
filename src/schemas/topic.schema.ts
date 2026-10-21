import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { Chapter } from './chapter.schema.js';
import { Tenant } from './tenant.schema.js';

export const TOPIC_STATUSES = ['active', 'inactive'] as const;

export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export type TopicDocument = HydratedDocument<Topic>;

@Schema({ timestamps: true, collection: 'topics' })
export class Topic {
  @Prop({ type: Types.ObjectId, ref: Tenant.name, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: Chapter.name,
    required: true,
    index: true,
  })
  chapterId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true })
  nameKey: string;

  @Prop({ required: true, min: 1, max: 100 })
  order: number;

  @Prop({
    type: String,
    required: true,
    enum: TOPIC_STATUSES,
    default: 'active',
  })
  status: TopicStatus;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const TopicSchema = SchemaFactory.createForClass(Topic);

TopicSchema.index({ tenantId: 1, chapterId: 1, nameKey: 1, deletedAt: 1 });
TopicSchema.index({ tenantId: 1, order: 1 });
