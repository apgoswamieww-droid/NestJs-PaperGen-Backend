import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { Tenant } from './tenant.schema.js';

export const DIFFICULTY_LEVEL_STATUSES = ['active', 'inactive'] as const;

export type DifficultyLevelStatus = (typeof DIFFICULTY_LEVEL_STATUSES)[number];

export type DifficultyLevelDocument = HydratedDocument<DifficultyLevel>;

@Schema({ timestamps: true, collection: 'difficultylevels' })
export class DifficultyLevel {
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
    enum: DIFFICULTY_LEVEL_STATUSES,
    default: 'active',
  })
  status: DifficultyLevelStatus;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const DifficultyLevelSchema =
  SchemaFactory.createForClass(DifficultyLevel);

DifficultyLevelSchema.index({ tenantId: 1, nameKey: 1, deletedAt: 1 });
DifficultyLevelSchema.index({ tenantId: 1, order: 1 });
