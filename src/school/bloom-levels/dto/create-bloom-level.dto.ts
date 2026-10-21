import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  BLOOM_LEVEL_STATUSES,
  type BloomLevelStatus,
} from '../../../schemas/bloom-level.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateBloomLevelDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @IsInt()
  @Min(1)
  @Max(100)
  order: number;

  @Transform(trimmed)
  @IsOptional()
  @IsIn(BLOOM_LEVEL_STATUSES)
  status?: BloomLevelStatus;
}
