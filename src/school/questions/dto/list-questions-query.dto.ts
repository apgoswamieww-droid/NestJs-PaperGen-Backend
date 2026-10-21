import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  QUESTION_STATUSES,
  type QuestionStatus,
} from '../../../schemas/question.schema.js';

export const QUESTION_PAGE_SIZES = [10, 25, 50] as const;
export const QUESTION_SORT_FIELDS = [
  'text',
  'marks',
  'createdAt',
  'updatedAt',
] as const;
export const QUESTION_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type QuestionSortField = (typeof QUESTION_SORT_FIELDS)[number];
export type QuestionSortDirection = (typeof QUESTION_SORT_DIRECTIONS)[number];

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function optionalMongoId(dto: object, field: string): boolean {
  const value = (dto as Record<string, unknown>)[field];

  return value !== undefined && value !== '';
}

export class ListQuestionsQueryDto {
  @Transform(trimmed)
  @ValidateIf(
    (dto: ListQuestionsQueryDto) =>
      dto.search !== undefined && dto.search !== '',
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @Transform(trimmed)
  @ValidateIf((dto: ListQuestionsQueryDto) => optionalMongoId(dto, 'mediumId'))
  @IsMongoId()
  mediumId?: string;

  @Transform(trimmed)
  @ValidateIf((dto: ListQuestionsQueryDto) =>
    optionalMongoId(dto, 'standardId'),
  )
  @IsMongoId()
  standardId?: string;

  @Transform(trimmed)
  @ValidateIf((dto: ListQuestionsQueryDto) => optionalMongoId(dto, 'subjectId'))
  @IsMongoId()
  subjectId?: string;

  @Transform(trimmed)
  @ValidateIf((dto: ListQuestionsQueryDto) => optionalMongoId(dto, 'chapterId'))
  @IsMongoId()
  chapterId?: string;

  @Transform(trimmed)
  @ValidateIf((dto: ListQuestionsQueryDto) => optionalMongoId(dto, 'topicId'))
  @IsMongoId()
  topicId?: string;

  @Transform(trimmed)
  @ValidateIf((dto: ListQuestionsQueryDto) =>
    optionalMongoId(dto, 'questionTypeId'),
  )
  @IsMongoId()
  questionTypeId?: string;

  @Transform(trimmed)
  @ValidateIf((dto: ListQuestionsQueryDto) =>
    optionalMongoId(dto, 'difficultyLevelId'),
  )
  @IsMongoId()
  difficultyLevelId?: string;

  @Transform(trimmed)
  @ValidateIf((dto: ListQuestionsQueryDto) =>
    optionalMongoId(dto, 'bloomLevelId'),
  )
  @IsMongoId()
  bloomLevelId?: string;

  @Transform(trimmed)
  @ValidateIf(
    (dto: ListQuestionsQueryDto) =>
      dto.status !== undefined && dto.status !== '',
  )
  @IsIn(QUESTION_STATUSES)
  status?: QuestionStatus | '';

  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  includeDeleted: boolean = false;

  @IsInt()
  @Min(1)
  page: number = 1;

  @IsIn(QUESTION_PAGE_SIZES)
  pageSize: number = 10;

  @IsIn(QUESTION_SORT_FIELDS)
  sort: QuestionSortField = 'createdAt';

  @IsIn(QUESTION_SORT_DIRECTIONS)
  dir: QuestionSortDirection = 'desc';
}
