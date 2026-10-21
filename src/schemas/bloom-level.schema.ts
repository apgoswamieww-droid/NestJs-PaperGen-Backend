import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { Tenant } from './tenant.schema.js';

export const BLOOM_LEVEL_STATUSES = ['active', 'inactive'] as const;

export type BloomLevelStatus = (typeof BLOOM_LEVEL_STATUSES)[number];

export type BloomLevelDocument = HydratedDocument<BloomLevel>;

@Schema({ timestamps: true, collection: 'bloomlevels' })
export class BloomLevel {
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
    enum: BLOOM_LEVEL_STATUSES,
    default: 'active',
  })
  status: BloomLevelStatus;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const BloomLevelSchema = SchemaFactory.createForClass(BloomLevel);

BloomLevelSchema.index({ tenantId: 1, nameKey: 1, deletedAt: 1 });
BloomLevelSchema.index({ tenantId: 1, order: 1 });
