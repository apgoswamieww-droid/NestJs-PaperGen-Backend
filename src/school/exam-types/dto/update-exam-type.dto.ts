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
  EXAM_TYPE_STATUSES,
  type ExamTypeStatus,
} from '../../../schemas/exam-type.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateExamTypeDto {
  @Transform(trimmed)
  @ValidateIf((dto: UpdateExamTypeDto) => dto.name !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ValidateIf((dto: UpdateExamTypeDto) => dto.order !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  order?: number;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateExamTypeDto) => dto.status !== undefined)
  @IsIn(EXAM_TYPE_STATUSES)
  status?: ExamTypeStatus;
}
