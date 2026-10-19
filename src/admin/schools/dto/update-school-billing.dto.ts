import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  BILLING_CYCLES,
  SUBSCRIPTION_STATUSES,
  type BillingCycle,
  type SubscriptionStatus,
} from '../../../schemas/plan.schema.js';

function lowerTrimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class UpdateSchoolBillingDto {
  @Transform(lowerTrimmed)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  plan?: string;

  @IsOptional()
  @IsIn(BILLING_CYCLES)
  billingCycle?: BillingCycle;

  @IsOptional()
  @IsIn(SUBSCRIPTION_STATUSES)
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional()
  @IsISO8601({ strict: true })
  renewalAt?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  trialEndsAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceOverride?: number | null;
}
