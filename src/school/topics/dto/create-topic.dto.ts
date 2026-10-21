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
  TOPIC_STATUSES,
  type TopicStatus,
} from '../../../schemas/topic.schema.js';

function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateTopicDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @IsMongoId()
  chapterId: string;

  @IsInt()
  @Min(1)
  @Max(100)
  order: number;

  @Transform(trimmed)
  @IsOptional()
  @IsIn(TOPIC_STATUSES)
  status?: TopicStatus;
}
