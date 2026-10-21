import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module.js';
import { Medium, MediumSchema } from '../../schemas/medium.schema.js';
import { Standard, StandardSchema } from '../../schemas/standard.schema.js';
import { Subject, SubjectSchema } from '../../schemas/subject.schema.js';
import { SubjectsController } from './subjects.controller.js';
import { SubjectsService } from './subjects.service.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Subject.name, schema: SubjectSchema },
      { name: Standard.name, schema: StandardSchema },
      { name: Medium.name, schema: MediumSchema },
    ]),
  ],
  controllers: [SubjectsController],
  providers: [SubjectsService],
})
export class SubjectsModule {}
