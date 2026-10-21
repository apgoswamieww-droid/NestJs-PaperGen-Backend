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
  DIFFICULTY_LEVEL_STATUSES,
  type DifficultyLevelStatus,
} from '../../../schemas/difficulty-level.schema.js';

export const DIFFICULTY_LEVEL_PAGE_SIZES = [10, 25, 50] as const;
export const DIFFICULTY_LEVEL_SORT_FIELDS = [
  'name',
  'order',
  'createdAt',
] as const;
export const DIFFICULTY_LEVEL_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type DifficultyLevelSortField =
  (typeof DIFFICULTY_LEVEL_SORT_FIELDS)[number];
export type DifficultyLevelSortDirection =
  (typeof DIFFICULTY_LEVEL_SORT_DIRECTIONS)[number];

export class ListDifficultyLevelsQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListDifficultyLevelsQueryDto) =>
      dto.search !== undefined && dto.search !== '',
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListDifficultyLevelsQueryDto) =>
      dto.status !== undefined && dto.status !== '',
  )
  @IsIn(DIFFICULTY_LEVEL_STATUSES)
  status?: DifficultyLevelStatus | '';

  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  includeDeleted: boolean = false;

  @IsInt()
  @Min(1)
  page: number = 1;

  @IsIn(DIFFICULTY_LEVEL_PAGE_SIZES)
  pageSize: number = 10;

  @IsIn(DIFFICULTY_LEVEL_SORT_FIELDS)
  sort: DifficultyLevelSortField = 'order';

  @IsIn(DIFFICULTY_LEVEL_SORT_DIRECTIONS)
  dir: DifficultyLevelSortDirection = 'asc';
}
