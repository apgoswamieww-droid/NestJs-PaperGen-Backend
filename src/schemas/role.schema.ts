import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { Tenant } from './tenant.schema.js';

export type RoleDocument = HydratedDocument<Role>;

@Schema({ timestamps: true, collection: 'roles' })
export class Role {
  @Prop({ type: Types.ObjectId, ref: Tenant.name, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true })
  nameKey: string;

  @Prop({ type: String, default: '', trim: true })
  description: string;

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ type: Boolean, default: false })
  isSystem: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

RoleSchema.index({ tenantId: 1, key: 1 }, { unique: true });
RoleSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true });
RoleSchema.index({ tenantId: 1, isSystem: 1 });
