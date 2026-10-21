import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
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

export class QuestionOptionDto {
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(5)
  key?: string;

  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text: string;

  @IsBoolean()
  isCorrect: boolean;
}

export class CreateQuestionDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text: string;

  @IsMongoId()
  chapterId: string;

  @Transform(blankToUndefined)
  @ValidateIf(
    (dto: CreateQuestionDto) =>
      dto.topicId !== undefined && dto.topicId !== null,
  )
  @IsMongoId()
  topicId?: string | null;

  @IsMongoId()
  questionTypeId: string;

  @IsMongoId()
  difficultyLevelId: string;

  @Transform(blankToUndefined)
  @ValidateIf(
    (dto: CreateQuestionDto) =>
      dto.bloomLevelId !== undefined && dto.bloomLevelId !== null,
  )
  @IsMongoId()
  bloomLevelId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  @ArrayMaxSize(MAX_QUESTION_OPTIONS)
  options?: QuestionOptionDto[];

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  answer?: string;

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  explanation?: string;

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  source?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(100)
  marks: number;

  @Transform(trimmed)
  @IsOptional()
  @IsIn(QUESTION_STATUSES)
  status?: QuestionStatus;
}
