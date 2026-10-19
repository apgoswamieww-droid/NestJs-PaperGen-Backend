import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import {
  BILLING_CYCLES,
  SUBSCRIPTION_STATUSES,
  type BillingCycle,
  type SubscriptionStatus,
} from './plan.schema.js';

export const TENANT_STATUSES = ['active', 'suspended'] as const;
export const TENANT_TYPES = ['school', 'institute'] as const;
export const TENANT_BOARDS = ['cbse', 'icse', 'state', 'ib', 'other'] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];
export type TenantType = (typeof TENANT_TYPES)[number];
export type TenantBoard = (typeof TENANT_BOARDS)[number];

export type TenantDocument = HydratedDocument<Tenant>;

@Schema({ timestamps: true, collection: 'tenants' })
export class Tenant {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({
    type: String,
    required: true,
    enum: TENANT_TYPES,
    default: 'school',
  })
  type: TenantType;

  @Prop({ type: String, trim: true, default: '' })
  city: string;

  @Prop({
    type: String,
    required: true,
    enum: TENANT_STATUSES,
    default: 'active',
  })
  status: TenantStatus;

  @Prop({ type: String, required: true, default: 'starter', trim: true })
  plan: string;

  @Prop({
    type: String,
    required: true,
    enum: BILLING_CYCLES,
    default: 'monthly',
  })
  billingCycle: BillingCycle;

  @Prop({
    type: String,
    required: true,
    enum: SUBSCRIPTION_STATUSES,
    default: 'active',
  })
  subscriptionStatus: SubscriptionStatus;

  @Prop({ type: Date, default: null })
  renewalAt: Date | null;

  @Prop({ type: Date, default: null })
  trialEndsAt: Date | null;

  @Prop({ type: Number, default: null })
  priceOverride: number | null;

  @Prop({ type: String, trim: true, default: '' })
  phone: string;

  @Prop({ type: String, trim: true, lowercase: true, default: '' })
  email: string;

  @Prop({ type: String, trim: true, default: '' })
  website: string;

  @Prop({ type: String, trim: true, default: '' })
  addressLine1: string;

  @Prop({ type: String, trim: true, default: '' })
  addressLine2: string;

  @Prop({ type: String, trim: true, default: '' })
  state: string;

  @Prop({ type: String, trim: true, default: '' })
  pincode: string;

  @Prop({ type: String, trim: true, default: '' })
  country: string;

  @Prop({ type: String, trim: true, default: '' })
  tagline: string;

  @Prop({ type: String, trim: true, default: '#73113a' })
  brandColor: string;

  @Prop({ type: String, default: '', select: false })
  logo: string;

  @Prop({
    type: String,
    trim: true,
    lowercase: true,
    default: '',
    validate: {
      validator: (value: string) =>
        value === '' || (TENANT_BOARDS as readonly string[]).includes(value),
      message: `board must be empty or one of: ${TENANT_BOARDS.join(', ')}`,
    },
  })
  board: string;

  @Prop({ type: String, trim: true, default: '' })
  affiliationNumber: string;

  @Prop({ type: String, trim: true, default: '' })
  principalName: string;

  @Prop({ type: String, trim: true, default: '' })
  academicYear: string;

  @Prop({ type: String, trim: true, default: 'Asia/Kolkata' })
  timezone: string;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
