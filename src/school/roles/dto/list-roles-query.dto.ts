import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const ROLE_PAGE_SIZES = [10, 25, 50] as const;
export const ROLE_SORT_FIELDS = ['name', 'createdAt'] as const;
export const ROLE_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type RoleSortField = (typeof ROLE_SORT_FIELDS)[number];
export type RoleSortDirection = (typeof ROLE_SORT_DIRECTIONS)[number];

export class ListRolesQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListRolesQueryDto) => dto.search !== undefined && dto.search !== '',
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsInt()
  @Min(1)
  page: number = 1;

  @IsIn(ROLE_PAGE_SIZES)
  pageSize: number = 10;

  @IsIn(ROLE_SORT_FIELDS)
  sort: RoleSortField = 'name';

  @IsIn(ROLE_SORT_DIRECTIONS)
  dir: RoleSortDirection = 'asc';
}
