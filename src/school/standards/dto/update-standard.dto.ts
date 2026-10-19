import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  STANDARD_STATUSES,
  type StandardStatus,
} from '../../../schemas/standard.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateStandardDto {
  @Transform(trimmed)
  @ValidateIf((dto: UpdateStandardDto) => dto.name !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ValidateIf((dto: UpdateStandardDto) => dto.mediumId !== undefined)
  @IsMongoId()
  mediumId?: string;

  @ValidateIf((dto: UpdateStandardDto) => dto.order !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  order?: number;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateStandardDto) => dto.status !== undefined)
  @IsIn(STANDARD_STATUSES)
  status?: StandardStatus;
}
