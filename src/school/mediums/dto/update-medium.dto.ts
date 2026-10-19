import { Transform } from 'class-transformer';
import {
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  MEDIUM_STATUSES,
  type MediumStatus,
} from '../../../schemas/medium.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateMediumDto {
  @Transform(trimmed)
  @ValidateIf((dto: UpdateMediumDto) => dto.name !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateMediumDto) => dto.status !== undefined)
  @IsIn(MEDIUM_STATUSES)
  status?: MediumStatus;
}
