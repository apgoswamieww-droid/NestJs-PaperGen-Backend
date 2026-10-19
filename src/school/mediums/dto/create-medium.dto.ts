import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  MEDIUM_STATUSES,
  type MediumStatus,
} from '../../../schemas/medium.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateMediumDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @Transform(trimmed)
  @IsOptional()
  @IsIn(MEDIUM_STATUSES)
  status?: MediumStatus;
}
