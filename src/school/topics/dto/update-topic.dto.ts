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
  TOPIC_STATUSES,
  type TopicStatus,
} from '../../../schemas/topic.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateTopicDto {
  @Transform(trimmed)
  @ValidateIf((dto: UpdateTopicDto) => dto.name !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ValidateIf((dto: UpdateTopicDto) => dto.chapterId !== undefined)
  @IsMongoId()
  chapterId?: string;

  @ValidateIf((dto: UpdateTopicDto) => dto.order !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  order?: number;

  @Transform(trimmed)
  @ValidateIf((dto: UpdateTopicDto) => dto.status !== undefined)
  @IsIn(TOPIC_STATUSES)
  status?: TopicStatus;
}
