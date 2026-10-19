import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { Medium } from './medium.schema.js';
import { Tenant } from './tenant.schema.js';

export const STANDARD_STATUSES = ['active', 'inactive'] as const;

export type StandardStatus = (typeof STANDARD_STATUSES)[number];

export type StandardDocument = HydratedDocument<Standard>;

@Schema({ timestamps: true, collection: 'standards' })
export class Standard {
  @Prop({ type: Types.ObjectId, ref: Tenant.name, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Medium.name, required: true, index: true })
  mediumId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true })
  nameKey: string;

  @Prop({ required: true, min: 1, max: 100 })
  order: number;

  @Prop({
    type: String,
    required: true,
    enum: STANDARD_STATUSES,
    default: 'active',
  })
  status: StandardStatus;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const StandardSchema = SchemaFactory.createForClass(Standard);

StandardSchema.index({ tenantId: 1, mediumId: 1, nameKey: 1, deletedAt: 1 });
StandardSchema.index({ tenantId: 1, order: 1 });
