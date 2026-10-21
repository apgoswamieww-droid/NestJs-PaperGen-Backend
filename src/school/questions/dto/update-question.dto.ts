import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  QUESTION_STATUSES,
  type QuestionStatus,
} from '../../../schemas/question.schema.js';
import { MAX_QUESTION_OPTIONS } from '../question-options.js';
import { QuestionOptionDto } from './create-question.dto.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function blankToUndefined({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const text = value.trim();

  return text === '' ? undefined : text;
}

export class UpdateQuestionDto {
  @Transform(trimmed)
  @ValidateIf((dto: UpdateQuestionDto) => dto.text !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text?: string;

  @ValidateIf((dto: UpdateQuestionDto) => dto.chapterId !== undefined)
  @IsMongoId()
  chapterId?: string;

  @Transform(blankToUndefined)
  @ValidateIf(
    (dto: UpdateQuestionDto) =>
      dto.topicId !== undefined && dto.topicId !== null,
  )
  @IsMongoId()
  topicId?: string | null;

  @ValidateIf((dto: UpdateQuestionDto) => dto.questionTypeId !== undefined)
  @IsMongoId()
  questionTypeId?: string;

  @ValidateIf((dto: UpdateQuestionDto) => dto.difficultyLevelId !== undefined)
  @IsMongoId()
  difficultyLevelId?: string;

  @Transform(blankToUndefined)
  @ValidateIf(
    (dto: UpdateQuestionDto) =>
      dto.bloomLevelId !== undefined && dto.bloomLevelId !== null,
  )
  @IsMongoId()
  bloomLevelId?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  @ArrayMaxSize(MAX_QUESTION_OPTIONS)
  @ValidateIf((dto: UpdateQuestionDto) => dto.options !== undefined)
  options?: QuestionOptionDto[];

  @Transform(trimmed)
  @ValidateIf((dto: UpdateQuestionDto) => dto.answer !== undefined)
  @IsString()
  @MaxLength(5000)
  answer?: string;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateQuestionDto) => dto.explanation !== undefined)
  @IsString()
  @MaxLength(5000)
  explanation?: string;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateQuestionDto) => dto.source !== undefined)
  @IsString()
  @MaxLength(200)
  source?: string;

  @ValidateIf((dto: UpdateQuestionDto) => dto.tags !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

  @ValidateIf((dto: UpdateQuestionDto) => dto.marks !== undefined)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(100)
  marks?: number;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateQuestionDto) => dto.status !== undefined)
  @IsIn(QUESTION_STATUSES)
  status?: QuestionStatus;
}
