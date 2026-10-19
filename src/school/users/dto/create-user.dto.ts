import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { USER_ROLES, type UserRole } from '../../../schemas/user.schema.js';

const PHONE_PATTERN = /^[0-9+()\-\s]{6,20}$/;

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function lowerTrimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class CreateUserDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @Transform(lowerTrimmed)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: CreateUserDto) => dto.phone !== undefined && dto.phone !== '',
  )
  @Matches(PHONE_PATTERN, {
    message: 'phone must be a valid contact number.',
  })
  phone?: string;

  @Transform(trimmed)
  @IsIn(USER_ROLES)
  role: UserRole;
}
