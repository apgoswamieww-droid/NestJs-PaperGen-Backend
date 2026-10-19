import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { trimmedFeatures } from './create-plan.dto.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdatePlanDto {
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyPrice?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  annualPrice?: number | null;

  @Transform(trimmedFeatures)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  features?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  maxStudents?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxTeachers?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxTotalUsers?: number | null;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
