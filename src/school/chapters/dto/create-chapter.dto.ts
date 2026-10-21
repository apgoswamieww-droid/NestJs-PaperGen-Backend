import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
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

export class CreateChapterDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @IsMongoId()
  subjectId: string;

  @Transform(trimmed)
  @IsIn(CHAPTER_REFERENCE_TYPES)
  referenceType: ChapterReferenceType;

  @IsInt()
  @Min(1)
  @Max(100)
  order: number;

  @Transform(trimmed)
  @IsOptional()
  @IsIn(CHAPTER_STATUSES)
  status?: ChapterStatus;
}
