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
  DIFFICULTY_LEVEL_STATUSES,
  type DifficultyLevelStatus,
} from '../../../schemas/difficulty-level.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateDifficultyLevelDto {
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
  @IsIn(DIFFICULTY_LEVEL_STATUSES)
  status?: DifficultyLevelStatus;
}
