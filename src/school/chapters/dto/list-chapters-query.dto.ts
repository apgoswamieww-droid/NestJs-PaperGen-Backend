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
  CHAPTER_REFERENCE_TYPES,
  CHAPTER_STATUSES,
  type ChapterReferenceType,
  type ChapterStatus,
} from '../../../schemas/chapter.schema.js';

export const CHAPTER_PAGE_SIZES = [10, 25, 50] as const;
export const CHAPTER_SORT_FIELDS = ['name', 'order', 'createdAt'] as const;
export const CHAPTER_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type ChapterSortField = (typeof CHAPTER_SORT_FIELDS)[number];
export type ChapterSortDirection = (typeof CHAPTER_SORT_DIRECTIONS)[number];

export class ListChaptersQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListChaptersQueryDto) =>
      dto.search !== undefined && dto.search !== '',
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListChaptersQueryDto) =>
      dto.subjectId !== undefined && dto.subjectId !== '',
  )
  @IsMongoId()
  subjectId?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListChaptersQueryDto) =>
      dto.referenceType !== undefined && dto.referenceType !== '',
  )
  @IsIn(CHAPTER_REFERENCE_TYPES)
  referenceType?: ChapterReferenceType | '';

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ListChaptersQueryDto) =>
      dto.status !== undefined && dto.status !== '',
  )
  @IsIn(CHAPTER_STATUSES)
  status?: ChapterStatus | '';

  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  includeDeleted: boolean = false;

  @IsInt()
  @Min(1)
  page: number = 1;

  @IsIn(CHAPTER_PAGE_SIZES)
  pageSize: number = 10;

  @IsIn(CHAPTER_SORT_FIELDS)
  sort: ChapterSortField = 'order';

  @IsIn(CHAPTER_SORT_DIRECTIONS)
  dir: ChapterSortDirection = 'asc';
}
