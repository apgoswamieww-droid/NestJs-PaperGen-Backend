import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { Tenant } from './tenant.schema.js';

export const MEDIUM_STATUSES = ['active', 'inactive'] as const;

export type MediumStatus = (typeof MEDIUM_STATUSES)[number];

export type MediumDocument = HydratedDocument<Medium>;

@Schema({ timestamps: true, collection: 'mediums' })
export class Medium {
  @Prop({ type: Types.ObjectId, ref: Tenant.name, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true })
  nameKey: string;

  @Prop({
    type: String,
    required: true,
    enum: MEDIUM_STATUSES,
    default: 'active',
  })
  status: MediumStatus;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const MediumSchema = SchemaFactory.createForClass(Medium);

MediumSchema.index({ tenantId: 1, nameKey: 1, deletedAt: 1 });
