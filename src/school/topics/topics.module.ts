import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module.js';
import { Chapter, ChapterSchema } from '../../schemas/chapter.schema.js';
import { Medium, MediumSchema } from '../../schemas/medium.schema.js';
import { Standard, StandardSchema } from '../../schemas/standard.schema.js';
import { Subject, SubjectSchema } from '../../schemas/subject.schema.js';
import { Topic, TopicSchema } from '../../schemas/topic.schema.js';
import { TopicsController } from './topics.controller.js';
import { TopicsService } from './topics.service.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Topic.name, schema: TopicSchema },
      { name: Chapter.name, schema: ChapterSchema },
      { name: Subject.name, schema: SubjectSchema },
      { name: Standard.name, schema: StandardSchema },
      { name: Medium.name, schema: MediumSchema },
    ]),
  ],
  controllers: [TopicsController],
  providers: [TopicsService],
})
export class TopicsModule {}
