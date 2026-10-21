import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { StudentProfileDto } from './student-profile.dto.js';

const PHONE_PATTERN = /^[0-9+()\-\s]{6,20}$/;
const ROLE_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function lowerTrimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class UpdateUserDto {
  @Transform(trimmed)
  @ValidateIf((dto: UpdateUserDto) => dto.name !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @Transform(lowerTrimmed)
  @ValidateIf(
    (dto: UpdateUserDto) => dto.email !== undefined && dto.email !== '',
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: UpdateUserDto) => dto.phone !== undefined && dto.phone !== '',
  )
  @Matches(PHONE_PATTERN, {
    message: 'phone must be a valid contact number.',
  })
  phone?: string;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateUserDto) => dto.role !== undefined)
  @IsString()
  @Matches(ROLE_PATTERN, { message: 'role is not valid.' })
  role?: string;

  @ValidateIf((dto: UpdateUserDto) => dto.studentProfile !== undefined)
  @ValidateNested()
  @Type(() => StudentProfileDto)
  studentProfile?: StudentProfileDto;
}
