import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PERMISSIONS } from '../../../auth/permissions.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateRoleDto {
  @Transform(trimmed)
  @ValidateIf((dto: UpdateRoleDto) => dto.name !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateRoleDto) => dto.description !== undefined)
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PERMISSIONS.length)
  @IsIn(PERMISSIONS, { each: true })
  permissions?: string[];
}
