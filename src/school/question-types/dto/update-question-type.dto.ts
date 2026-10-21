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
  QUESTION_TYPE_STATUSES,
  type QuestionTypeStatus,
} from '../../../schemas/question-type.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateQuestionTypeDto {
  @Transform(trimmed)
  @ValidateIf((dto: UpdateQuestionTypeDto) => dto.name !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ValidateIf((dto: UpdateQuestionTypeDto) => dto.order !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  order?: number;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateQuestionTypeDto) => dto.status !== undefined)
  @IsIn(QUESTION_TYPE_STATUSES)
  status?: QuestionTypeStatus;
}
