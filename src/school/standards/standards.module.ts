import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module.js';
import { Medium, MediumSchema } from '../../schemas/medium.schema.js';
import { Standard, StandardSchema } from '../../schemas/standard.schema.js';
import { StandardsController } from './standards.controller.js';
import { StandardsService } from './standards.service.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Standard.name, schema: StandardSchema },
      { name: Medium.name, schema: MediumSchema },
    ]),
  ],
  controllers: [StandardsController],
  providers: [StandardsService],
})
export class StandardsModule {}
