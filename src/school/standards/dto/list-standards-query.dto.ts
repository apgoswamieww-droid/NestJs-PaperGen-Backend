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
  STANDARD_STATUSES,
  type StandardStatus,
} from '../../../schemas/standard.schema.js';

export const STANDARD_PAGE_SIZES = [10, 25, 50] as const;
export const STANDARD_SORT_FIELDS = ['name', 'order', 'createdAt'] as const;
export const STANDARD_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type StandardSortField = (typeof STANDARD_SORT_FIELDS)[number];
export type StandardSortDirection = (typeof STANDARD_SORT_DIRECTIONS)[number];

export class ListStandardsQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListStandardsQueryDto) =>
      dto.search !== undefined && dto.search !== '',
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListStandardsQueryDto) =>
      dto.mediumId !== undefined && dto.mediumId !== '',
  )
  @IsMongoId()
  mediumId?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListStandardsQueryDto) =>
      dto.status !== undefined && dto.status !== '',
  )
  @IsIn(STANDARD_STATUSES)
  status?: StandardStatus | '';

  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  includeDeleted: boolean = false;

  @IsInt()
  @Min(1)
  page: number = 1;

  @IsIn(STANDARD_PAGE_SIZES)
  pageSize: number = 10;

  @IsIn(STANDARD_SORT_FIELDS)
  sort: StandardSortField = 'order';

  @IsIn(STANDARD_SORT_DIRECTIONS)
  dir: StandardSortDirection = 'asc';
}
