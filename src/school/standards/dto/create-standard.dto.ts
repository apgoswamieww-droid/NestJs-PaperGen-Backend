import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  STANDARD_STATUSES,
  type StandardStatus,
} from '../../../schemas/standard.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateStandardDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @IsMongoId()
  mediumId: string;

  @IsInt()
  @Min(1)
  @Max(100)
  order: number;

  @Transform(trimmed)
  @IsOptional()
  @IsIn(STANDARD_STATUSES)
  status?: StandardStatus;
}
