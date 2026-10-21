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
  BLOOM_LEVEL_STATUSES,
  type BloomLevelStatus,
} from '../../../schemas/bloom-level.schema.js';

export const BLOOM_LEVEL_PAGE_SIZES = [10, 25, 50] as const;
export const BLOOM_LEVEL_SORT_FIELDS = ['name', 'order', 'createdAt'] as const;
export const BLOOM_LEVEL_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type BloomLevelSortField = (typeof BLOOM_LEVEL_SORT_FIELDS)[number];
export type BloomLevelSortDirection =
  (typeof BLOOM_LEVEL_SORT_DIRECTIONS)[number];

export class ListBloomLevelsQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListBloomLevelsQueryDto) =>
      dto.search !== undefined && dto.search !== '',
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListBloomLevelsQueryDto) =>
      dto.status !== undefined && dto.status !== '',
  )
  @IsIn(BLOOM_LEVEL_STATUSES)
  status?: BloomLevelStatus | '';

  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  includeDeleted: boolean = false;

  @IsInt()
  @Min(1)
  page: number = 1;

  @IsIn(BLOOM_LEVEL_PAGE_SIZES)
  pageSize: number = 10;

  @IsIn(BLOOM_LEVEL_SORT_FIELDS)
  sort: BloomLevelSortField = 'order';

  @IsIn(BLOOM_LEVEL_SORT_DIRECTIONS)
  dir: BloomLevelSortDirection = 'asc';
}
