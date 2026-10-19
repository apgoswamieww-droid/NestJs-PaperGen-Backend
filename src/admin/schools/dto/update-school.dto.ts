import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  TENANT_BOARDS,
  TENANT_TYPES,
  type TenantType,
} from '../../../schemas/tenant.schema.js';

const SLUG_PATTERN = /^[a-z0-9-]{3,60}$/;
const LOGO_PATTERN =
  /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
const PHONE_PATTERN = /^[0-9+()\-\s]{6,20}$/;
const PINCODE_PATTERN = /^\d{4,10}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const ACADEMIC_YEAR_PATTERN = /^\d{4}(-\d{2,4})?$/;

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function lowerTrimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

@ValidatorConstraint({ name: 'isIanaTimeZone', async: false })
class IsIanaTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) {
      return false;
    }

    try {
      Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'timezone must be a valid IANA time zone.';
  }
}

export class UpdateSchoolDto {
  @Transform(trimmed)
  @ValidateIf((dto: UpdateSchoolDto) => dto.name !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @Transform(lowerTrimmed)
  @ValidateIf((dto: UpdateSchoolDto) => dto.slug !== undefined)
  @Matches(SLUG_PATTERN, {
    message: 'slug must contain only lowercase letters, numbers and dashes.',
  })
  slug?: string;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateSchoolDto) => dto.type !== undefined)
  @IsIn(TENANT_TYPES)
  type?: TenantType;

  @Transform(lowerTrimmed)
  @ValidateIf((dto: UpdateSchoolDto) => dto.plan !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  plan?: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: UpdateSchoolDto) => dto.city !== undefined && dto.city !== '',
  )
  @IsString()
  @MaxLength(80)
  city?: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: UpdateSchoolDto) => dto.phone !== undefined && dto.phone !== '',
  )
  @Matches(PHONE_PATTERN, {
    message: 'phone must be a valid contact number.',
  })
  phone?: string;

  @Transform(lowerTrimmed)
  @ValidateIf(
    (dto: UpdateSchoolDto) => dto.email !== undefined && dto.email !== '',
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: UpdateSchoolDto) => dto.website !== undefined && dto.website !== '',
  )
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(200)
  website?: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: UpdateSchoolDto) =>
      dto.addressLine1 !== undefined && dto.addressLine1 !== '',
  )
  @IsString()
  @MaxLength(160)
  addressLine1?: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: UpdateSchoolDto) =>
      dto.addressLine2 !== undefined && dto.addressLine2 !== '',
  )
  @IsString()
  @MaxLength(160)
  addressLine2?: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: UpdateSchoolDto) => dto.state !== undefined && dto.state !== '',
  )
  @IsString()
  @MaxLength(80)
  state?: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: UpdateSchoolDto) => dto.pincode !== undefined && dto.pincode !== '',
  )
  @Matches(PINCODE_PATTERN, { message: 'pincode must be 4 to 10 digits.' })
  pincode?: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: UpdateSchoolDto) => dto.country !== undefined && dto.country !== '',
  )
  @IsString()
  @MaxLength(80)
  country?: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: UpdateSchoolDto) => dto.tagline !== undefined && dto.tagline !== '',
  )
  @IsString()
  @MaxLength(160)
  tagline?: string;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateSchoolDto) => dto.brandColor !== undefined)
  @Matches(COLOR_PATTERN, { message: 'brandColor must be a hex colour.' })
  brandColor?: string;

  @ValidateIf(
    (dto: UpdateSchoolDto) => dto.logo !== undefined && dto.logo !== '',
  )
  @Matches(LOGO_PATTERN, {
    message: 'logo must be a PNG, JPEG, WebP or SVG data URL.',
  })
  @MaxLength(2_800_000, { message: 'logo must be 2 MB or smaller.' })
  logo?: string;

  @Transform(lowerTrimmed)
  @ValidateIf((dto: UpdateSchoolDto) => dto.board !== undefined)
  @IsIn([...TENANT_BOARDS, ''])
  board?: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: UpdateSchoolDto) =>
      dto.affiliationNumber !== undefined && dto.affiliationNumber !== '',
  )
  @IsString()
  @MaxLength(60)
  affiliationNumber?: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: UpdateSchoolDto) =>
      dto.principalName !== undefined && dto.principalName !== '',
  )
  @IsString()
  @MaxLength(120)
  principalName?: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: UpdateSchoolDto) =>
      dto.academicYear !== undefined && dto.academicYear !== '',
  )
  @Matches(ACADEMIC_YEAR_PATTERN, {
    message: 'academicYear must look like 2025-26.',
  })
  academicYear?: string;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateSchoolDto) => dto.timezone !== undefined)
  @Validate(IsIanaTimeZoneConstraint)
  timezone?: string;
}
