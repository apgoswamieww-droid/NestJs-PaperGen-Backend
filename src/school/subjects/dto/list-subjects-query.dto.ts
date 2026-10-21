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
  SUBJECT_STATUSES,
  type SubjectStatus,
} from '../../../schemas/subject.schema.js';

export const SUBJECT_PAGE_SIZES = [10, 25, 50] as const;
export const SUBJECT_SORT_FIELDS = ['name', 'order', 'createdAt'] as const;
export const SUBJECT_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type SubjectSortField = (typeof SUBJECT_SORT_FIELDS)[number];
export type SubjectSortDirection = (typeof SUBJECT_SORT_DIRECTIONS)[number];

export class ListSubjectsQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListSubjectsQueryDto) =>
      dto.search !== undefined && dto.search !== '',
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListSubjectsQueryDto) =>
      dto.standardId !== undefined && dto.standardId !== '',
  )
  @IsMongoId()
  standardId?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListSubjectsQueryDto) =>
      dto.status !== undefined && dto.status !== '',
  )
  @IsIn(SUBJECT_STATUSES)
  status?: SubjectStatus | '';

  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  includeDeleted: boolean = false;

  @IsInt()
  @Min(1)
  page: number = 1;

  @IsIn(SUBJECT_PAGE_SIZES)
  pageSize: number = 10;

  @IsIn(SUBJECT_SORT_FIELDS)
  sort: SubjectSortField = 'order';

  @IsIn(SUBJECT_SORT_DIRECTIONS)
  dir: SubjectSortDirection = 'asc';
}
