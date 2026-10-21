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
  QUESTION_TYPE_STATUSES,
  type QuestionTypeStatus,
} from '../../../schemas/question-type.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateQuestionTypeDto {
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
  @IsIn(QUESTION_TYPE_STATUSES)
  status?: QuestionTypeStatus;
}
