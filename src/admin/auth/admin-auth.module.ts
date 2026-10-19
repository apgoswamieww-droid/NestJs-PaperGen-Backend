import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { AdminAuthController } from './admin-auth.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminAuthController],
})
export class AdminAuthModule {}
