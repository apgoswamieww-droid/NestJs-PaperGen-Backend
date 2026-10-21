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
  SUBJECT_STATUSES,
  type SubjectStatus,
} from '../../../schemas/subject.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateSubjectDto {
  @Transform(trimmed)
  @ValidateIf((dto: UpdateSubjectDto) => dto.name !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ValidateIf((dto: UpdateSubjectDto) => dto.standardId !== undefined)
  @IsMongoId()
  standardId?: string;

  @ValidateIf((dto: UpdateSubjectDto) => dto.order !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  order?: number;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateSubjectDto) => dto.status !== undefined)
  @IsIn(SUBJECT_STATUSES)
  status?: SubjectStatus;
}
