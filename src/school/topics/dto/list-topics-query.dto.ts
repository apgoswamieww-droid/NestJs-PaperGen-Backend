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
  TOPIC_STATUSES,
  type TopicStatus,
} from '../../../schemas/topic.schema.js';

export const TOPIC_PAGE_SIZES = [10, 25, 50] as const;
export const TOPIC_SORT_FIELDS = ['name', 'order', 'createdAt'] as const;
export const TOPIC_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type TopicSortField = (typeof TOPIC_SORT_FIELDS)[number];
export type TopicSortDirection = (typeof TOPIC_SORT_DIRECTIONS)[number];

export class ListTopicsQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListTopicsQueryDto) => dto.search !== undefined && dto.search !== '',
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListTopicsQueryDto) =>
      dto.chapterId !== undefined && dto.chapterId !== '',
  )
  @IsMongoId()
  chapterId?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListTopicsQueryDto) => dto.status !== undefined && dto.status !== '',
  )
  @IsIn(TOPIC_STATUSES)
  status?: TopicStatus | '';

  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  includeDeleted: boolean = false;

  @IsInt()
  @Min(1)
  page: number = 1;

  @IsIn(TOPIC_PAGE_SIZES)
  pageSize: number = 10;

  @IsIn(TOPIC_SORT_FIELDS)
  sort: TopicSortField = 'order';

  @IsIn(TOPIC_SORT_DIRECTIONS)
  dir: TopicSortDirection = 'asc';
}
