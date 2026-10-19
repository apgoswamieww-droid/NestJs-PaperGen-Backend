import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export const BILLING_CYCLES = ['monthly', 'annual'] as const;
export const SUBSCRIPTION_STATUSES = [
  'trial',
  'active',
  'past_due',
  'cancelled',
] as const;

export type BillingCycle = (typeof BILLING_CYCLES)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type PlanDocument = HydratedDocument<Plan>;

@Schema({ _id: false })
export class PlanLimits {
  @Prop({ type: Number, default: null })
  maxStudents: number | null;

  @Prop({ type: Number, default: null })
  maxTeachers: number | null;

  @Prop({ type: Number, default: null })
  maxTotalUsers: number | null;
}

export const PlanLimitsSchema = SchemaFactory.createForClass(PlanLimits);

@Schema({ timestamps: true, collection: 'plans' })
export class Plan {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, trim: true, default: '' })
  tagline: string;

  @Prop({ type: Number, default: null })
  monthlyPrice: number | null;

  @Prop({ type: Number, default: null })
  annualPrice: number | null;

  @Prop({ type: [String], default: [] })
  features: string[];

  @Prop({
    type: PlanLimitsSchema,
    default: () => ({
      maxStudents: null,
      maxTeachers: null,
      maxTotalUsers: null,
    }),
  })
  limits: PlanLimits;

  @Prop({ type: Boolean, default: false })
  featured: boolean;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  @Prop({ type: Number, default: 0 })
  sortOrder: number;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);
