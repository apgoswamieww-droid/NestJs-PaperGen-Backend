import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module.js';
import {
  QuestionType,
  QuestionTypeSchema,
} from '../../schemas/question-type.schema.js';
import { QuestionTypesController } from './question-types.controller.js';
import { QuestionTypesService } from './question-types.service.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: QuestionType.name, schema: QuestionTypeSchema },
    ]),
  ],
  controllers: [QuestionTypesController],
  providers: [QuestionTypesService],
})
export class QuestionTypesModule {}
