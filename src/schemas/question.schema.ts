import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { BloomLevel } from './bloom-level.schema.js';
import { Chapter } from './chapter.schema.js';
import { DifficultyLevel } from './difficulty-level.schema.js';
import { QuestionType } from './question-type.schema.js';
import { Tenant } from './tenant.schema.js';
import { Topic } from './topic.schema.js';
import { User } from './user.schema.js';

export const QUESTION_STATUSES = ['active', 'inactive'] as const;

export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
export type QuestionDocument = HydratedDocument<Question>;

@Schema({ _id: false })
export class QuestionOption {
  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  text: string;

  @Prop({ type: Boolean, required: true, default: false })
  isCorrect: boolean;
}

export const QuestionOptionSchema =
  SchemaFactory.createForClass(QuestionOption);

@Schema({ timestamps: true, collection: 'questions' })
export class Question {
  @Prop({ type: Types.ObjectId, ref: Tenant.name, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: Chapter.name,
    required: true,
    index: true,
  })
  chapterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Topic.name, default: null, index: true })
  topicId: Types.ObjectId | null;

  @Prop({
    type: Types.ObjectId,
    ref: QuestionType.name,
    required: true,
    index: true,
  })
  questionTypeId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: DifficultyLevel.name,
    required: true,
    index: true,
  })
  difficultyLevelId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: BloomLevel.name, default: null })
  bloomLevelId: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  text: string;

  @Prop({ type: [QuestionOptionSchema], default: [] })
  options: QuestionOption[];

  @Prop({ type: String, default: '', trim: true })
  answer: string;

  @Prop({ type: String, default: '', trim: true })
  explanation: string;

  @Prop({ type: String, default: '', trim: true })
  source: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ required: true, min: 0.5, max: 100 })
  marks: number;

  @Prop({
    type: String,
    required: true,
    enum: QUESTION_STATUSES,
    default: 'active',
  })
  status: QuestionStatus;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  createdBy: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  updatedBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);

QuestionSchema.index({
  tenantId: 1,
  chapterId: 1,
  topicId: 1,
  deletedAt: 1,
});
QuestionSchema.index({
  tenantId: 1,
  questionTypeId: 1,
  difficultyLevelId: 1,
  bloomLevelId: 1,
  deletedAt: 1,
});
QuestionSchema.index({ tenantId: 1, status: 1, deletedAt: 1 });
QuestionSchema.index({ tenantId: 1, createdAt: -1 });
