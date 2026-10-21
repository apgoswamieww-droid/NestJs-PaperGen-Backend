import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsString,
  ValidateIf,
} from 'class-validator';
import {
  DIFFICULTY_LEVEL_STATUSES,
  type DifficultyLevelStatus,
} from '../../../schemas/difficulty-level.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateDifficultyLevelDto {
  @Transform(trimmed)
  @ValidateIf((dto: UpdateDifficultyLevelDto) => dto.name !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ValidateIf((dto: UpdateDifficultyLevelDto) => dto.order !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  order?: number;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateDifficultyLevelDto) => dto.status !== undefined)
  @IsIn(DIFFICULTY_LEVEL_STATUSES)
  status?: DifficultyLevelStatus;
}
