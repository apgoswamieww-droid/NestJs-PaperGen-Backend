import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  QUESTION_TYPE_STATUSES,
  type QuestionTypeStatus,
} from '../../../schemas/question-type.schema.js';

export const QUESTION_TYPE_PAGE_SIZES = [10, 25, 50] as const;
export const QUESTION_TYPE_SORT_FIELDS = [
  'name',
  'order',
  'createdAt',
] as const;
export const QUESTION_TYPE_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type QuestionTypeSortField = (typeof QUESTION_TYPE_SORT_FIELDS)[number];
export type QuestionTypeSortDirection =
  (typeof QUESTION_TYPE_SORT_DIRECTIONS)[number];

export class ListQuestionTypesQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListQuestionTypesQueryDto) =>
      dto.search !== undefined && dto.search !== '',
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListQuestionTypesQueryDto) =>
      dto.status !== undefined && dto.status !== '',
  )
  @IsIn(QUESTION_TYPE_STATUSES)
  status?: QuestionTypeStatus | '';

  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  includeDeleted: boolean = false;

  @IsInt()
  @Min(1)
  page: number = 1;

  @IsIn(QUESTION_TYPE_PAGE_SIZES)
  pageSize: number = 10;

  @IsIn(QUESTION_TYPE_SORT_FIELDS)
  sort: QuestionTypeSortField = 'order';

  @IsIn(QUESTION_TYPE_SORT_DIRECTIONS)
  dir: QuestionTypeSortDirection = 'asc';
}
