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
  BLOOM_LEVEL_STATUSES,
  type BloomLevelStatus,
} from '../../../schemas/bloom-level.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateBloomLevelDto {
  @Transform(trimmed)
  @ValidateIf((dto: UpdateBloomLevelDto) => dto.name !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ValidateIf((dto: UpdateBloomLevelDto) => dto.order !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  order?: number;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateBloomLevelDto) => dto.status !== undefined)
  @IsIn(BLOOM_LEVEL_STATUSES)
  status?: BloomLevelStatus;
}
