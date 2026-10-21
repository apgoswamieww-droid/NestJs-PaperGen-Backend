import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module.js';
import {
  DifficultyLevel,
  DifficultyLevelSchema,
} from '../../schemas/difficulty-level.schema.js';
import { DifficultyLevelsController } from './difficulty-levels.controller.js';
import { DifficultyLevelsService } from './difficulty-levels.service.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: DifficultyLevel.name, schema: DifficultyLevelSchema },
    ]),
  ],
  controllers: [DifficultyLevelsController],
  providers: [DifficultyLevelsService],
})
export class DifficultyLevelsModule {}
