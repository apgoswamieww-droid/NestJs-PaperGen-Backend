import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  CHAPTER_REFERENCE_TYPES,
  CHAPTER_STATUSES,
  type ChapterReferenceType,
  type ChapterStatus,
} from '../../../schemas/chapter.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateChapterDto {
  @Transform(trimmed)
  @ValidateIf((dto: UpdateChapterDto) => dto.name !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ValidateIf((dto: UpdateChapterDto) => dto.subjectId !== undefined)
  @IsMongoId()
  subjectId?: string;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateChapterDto) => dto.referenceType !== undefined)
  @IsIn(CHAPTER_REFERENCE_TYPES)
  referenceType?: ChapterReferenceType;

  @ValidateIf((dto: UpdateChapterDto) => dto.order !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  order?: number;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateChapterDto) => dto.status !== undefined)
  @IsIn(CHAPTER_STATUSES)
  status?: ChapterStatus;
}
