import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module.js';
import { MailModule } from '../../mail/mail.module.js';
import {
  PasswordResetToken,
  PasswordResetTokenSchema,
} from '../../schemas/password-reset-token.schema.js';
import {
  RefreshToken,
  RefreshTokenSchema,
} from '../../schemas/refresh-token.schema.js';
import { Plan, PlanSchema } from '../../schemas/plan.schema.js';
import { Tenant, TenantSchema } from '../../schemas/tenant.schema.js';
import { User, UserSchema } from '../../schemas/user.schema.js';
import { AdminSchoolsController } from './admin-schools.controller.js';
import { AdminSchoolsService } from './admin-schools.service.js';

@Module({
  imports: [
    AuthModule,
    MailModule,
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: Plan.name, schema: PlanSchema },
      { name: User.name, schema: UserSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: PasswordResetToken.name, schema: PasswordResetTokenSchema },
    ]),
  ],
  controllers: [AdminSchoolsController],
  providers: [AdminSchoolsService],
})
export class AdminSchoolsModule {}
