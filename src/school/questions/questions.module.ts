import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module.js';
import {
  BloomLevel,
  BloomLevelSchema,
} from '../../schemas/bloom-level.schema.js';
import { Chapter, ChapterSchema } from '../../schemas/chapter.schema.js';
import {
  DifficultyLevel,
  DifficultyLevelSchema,
} from '../../schemas/difficulty-level.schema.js';
import { Medium, MediumSchema } from '../../schemas/medium.schema.js';
import {
  QuestionType,
  QuestionTypeSchema,
} from '../../schemas/question-type.schema.js';
import { Question, QuestionSchema } from '../../schemas/question.schema.js';
import { Standard, StandardSchema } from '../../schemas/standard.schema.js';
import { Subject, SubjectSchema } from '../../schemas/subject.schema.js';
import { Topic, TopicSchema } from '../../schemas/topic.schema.js';
import { QuestionsController } from './questions.controller.js';
import { QuestionsService } from './questions.service.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
      { name: Chapter.name, schema: ChapterSchema },
      { name: Topic.name, schema: TopicSchema },
      { name: Subject.name, schema: SubjectSchema },
      { name: Standard.name, schema: StandardSchema },
      { name: Medium.name, schema: MediumSchema },
      { name: QuestionType.name, schema: QuestionTypeSchema },
      { name: DifficultyLevel.name, schema: DifficultyLevelSchema },
      { name: BloomLevel.name, schema: BloomLevelSchema },
    ]),
  ],
  controllers: [QuestionsController],
  providers: [QuestionsService],
})
export class QuestionsModule {}
