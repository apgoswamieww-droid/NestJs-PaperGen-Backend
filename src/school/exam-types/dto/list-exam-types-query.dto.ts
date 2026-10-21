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
  EXAM_TYPE_STATUSES,
  type ExamTypeStatus,
} from '../../../schemas/exam-type.schema.js';

export const EXAM_TYPE_PAGE_SIZES = [10, 25, 50] as const;
export const EXAM_TYPE_SORT_FIELDS = ['name', 'order', 'createdAt'] as const;
export const EXAM_TYPE_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type ExamTypeSortField = (typeof EXAM_TYPE_SORT_FIELDS)[number];
export type ExamTypeSortDirection = (typeof EXAM_TYPE_SORT_DIRECTIONS)[number];

export class ListExamTypesQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListExamTypesQueryDto) =>
      dto.search !== undefined && dto.search !== '',
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListExamTypesQueryDto) =>
      dto.status !== undefined && dto.status !== '',
  )
  @IsIn(EXAM_TYPE_STATUSES)
  status?: ExamTypeStatus | '';

  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  includeDeleted: boolean = false;

  @IsInt()
  @Min(1)
  page: number = 1;

  @IsIn(EXAM_TYPE_PAGE_SIZES)
  pageSize: number = 10;

  @IsIn(EXAM_TYPE_SORT_FIELDS)
  sort: ExamTypeSortField = 'order';

  @IsIn(EXAM_TYPE_SORT_DIRECTIONS)
  dir: ExamTypeSortDirection = 'asc';
}
