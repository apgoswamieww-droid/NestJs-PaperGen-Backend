import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { Tenant } from './tenant.schema.js';

export const ROLE_AUDIT_ACTIONS = ['created', 'updated', 'deleted'] as const;

export type RoleAuditAction = (typeof ROLE_AUDIT_ACTIONS)[number];

export interface RoleAuditSnapshot {
  name: string;
  description: string;
  permissions: string[];
}

export type RoleAuditDocument = HydratedDocument<RoleAudit>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'roleaudits',
})
export class RoleAudit {
  @Prop({ type: Types.ObjectId, ref: Tenant.name, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  roleKey: string;

  @Prop({ required: true, trim: true })
  roleName: string;

  @Prop({ type: String, required: true, enum: ROLE_AUDIT_ACTIONS })
  action: RoleAuditAction;

  @Prop({ type: Types.ObjectId, required: true })
  actorId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  actorName: string;

  @Prop({ required: true, trim: true })
  actorEmail: string;

  @Prop({ type: Object, default: null })
  before: RoleAuditSnapshot | null;

  @Prop({ type: Object, default: null })
  after: RoleAuditSnapshot | null;
}

export const RoleAuditSchema = SchemaFactory.createForClass(RoleAudit);

RoleAuditSchema.index({ tenantId: 1, createdAt: -1 });
RoleAuditSchema.index({ tenantId: 1, roleKey: 1, createdAt: -1 });
