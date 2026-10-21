import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  ACCOUNT_STATUSES,
  type AccountStatus,
} from '../../../schemas/user.schema.js';

export const USER_PAGE_SIZES = [10, 25, 50] as const;
export const USER_SORT_FIELDS = ['name', 'createdAt'] as const;
export const USER_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type UserSortField = (typeof USER_SORT_FIELDS)[number];
export type UserSortDirection = (typeof USER_SORT_DIRECTIONS)[number];

export class ListUsersQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListUsersQueryDto) => dto.search !== undefined && dto.search !== '',
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @ValidateIf(
    (dto: ListUsersQueryDto) => dto.role !== undefined && dto.role !== '',
  )
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,39}$/, { message: 'role is not valid.' })
  role?: string;

  @ValidateIf(
    (dto: ListUsersQueryDto) => dto.status !== undefined && dto.status !== '',
  )
  @IsIn(ACCOUNT_STATUSES)
  status?: AccountStatus | '';

  @IsInt()
  @Min(1)
  page: number = 1;

  @IsIn(USER_PAGE_SIZES)
  pageSize: number = 10;

  @IsIn(USER_SORT_FIELDS)
  sort: UserSortField = 'createdAt';

  @IsIn(USER_SORT_DIRECTIONS)
  dir: UserSortDirection = 'desc';
}
