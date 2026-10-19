import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  TENANT_TYPES,
  type TenantType,
} from '../../../schemas/tenant.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function lowerTrimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class CreateSchoolDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @Transform(trimmed)
  @IsIn(TENANT_TYPES)
  type: TenantType;

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @Transform(lowerTrimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  plan: string;

  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  adminName: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  adminEmail: string;
}
