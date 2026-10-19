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
  MEDIUM_STATUSES,
  type MediumStatus,
} from '../../../schemas/medium.schema.js';

export const MEDIUM_PAGE_SIZES = [10, 25, 50] as const;
export const MEDIUM_SORT_FIELDS = ['name', 'createdAt'] as const;
export const MEDIUM_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type MediumSortField = (typeof MEDIUM_SORT_FIELDS)[number];
export type MediumSortDirection = (typeof MEDIUM_SORT_DIRECTIONS)[number];

export class ListMediumsQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListMediumsQueryDto) => dto.search !== undefined && dto.search !== '',
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListMediumsQueryDto) => dto.status !== undefined && dto.status !== '',
  )
  @IsIn(MEDIUM_STATUSES)
  status?: MediumStatus | '';

  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  includeDeleted: boolean = false;

  @IsInt()
  @Min(1)
  page: number = 1;

  @IsIn(MEDIUM_PAGE_SIZES)
  pageSize: number = 10;

  @IsIn(MEDIUM_SORT_FIELDS)
  sort: MediumSortField = 'name';

  @IsIn(MEDIUM_SORT_DIRECTIONS)
  dir: MediumSortDirection = 'asc';
}
