import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module.js';
import { ExamType, ExamTypeSchema } from '../../schemas/exam-type.schema.js';
import { ExamTypesController } from './exam-types.controller.js';
import { ExamTypesService } from './exam-types.service.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: ExamType.name, schema: ExamTypeSchema },
    ]),
  ],
  controllers: [ExamTypesController],
  providers: [ExamTypesService],
})
export class ExamTypesModule {}
