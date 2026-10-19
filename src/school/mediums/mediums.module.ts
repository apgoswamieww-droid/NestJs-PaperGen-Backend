import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module.js';
import { Medium, MediumSchema } from '../../schemas/medium.schema.js';
import { MediumsController } from './mediums.controller.js';
import { MediumsService } from './mediums.service.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: Medium.name, schema: MediumSchema }]),
  ],
  controllers: [MediumsController],
  providers: [MediumsService],
})
export class MediumsModule {}
