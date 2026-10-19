import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module.js';
import { Plan, PlanSchema } from '../../schemas/plan.schema.js';
import { Tenant, TenantSchema } from '../../schemas/tenant.schema.js';
import { AdminPlansController } from './admin-plans.controller.js';
import { AdminPlansService } from './admin-plans.service.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Plan.name, schema: PlanSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  controllers: [AdminPlansController],
  providers: [AdminPlansService],
})
export class AdminPlansModule {}
