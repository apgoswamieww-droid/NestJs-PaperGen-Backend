import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module.js';
import {
  BloomLevel,
  BloomLevelSchema,
} from '../../schemas/bloom-level.schema.js';
import { BloomLevelsController } from './bloom-levels.controller.js';
import { BloomLevelsService } from './bloom-levels.service.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: BloomLevel.name, schema: BloomLevelSchema },
    ]),
  ],
  controllers: [BloomLevelsController],
  providers: [BloomLevelsService],
})
export class BloomLevelsModule {}
