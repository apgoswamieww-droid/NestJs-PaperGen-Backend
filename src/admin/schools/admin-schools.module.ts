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
import { Chapter, ChapterSchema } from '../../schemas/chapter.schema.js';
import { Medium, MediumSchema } from '../../schemas/medium.schema.js';
import { Plan, PlanSchema } from '../../schemas/plan.schema.js';
import { Standard, StandardSchema } from '../../schemas/standard.schema.js';
import { Subject, SubjectSchema } from '../../schemas/subject.schema.js';
import { Tenant, TenantSchema } from '../../schemas/tenant.schema.js';
import { Topic, TopicSchema } from '../../schemas/topic.schema.js';
import { User, UserSchema } from '../../schemas/user.schema.js';
import { AdminSchoolsController } from './admin-schools.controller.js';
import { AdminSchoolsService } from './admin-schools.service.js';
import { MasterSeedService } from './master-seed.service.js';

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
      { name: Medium.name, schema: MediumSchema },
      { name: Standard.name, schema: StandardSchema },
      { name: Subject.name, schema: SubjectSchema },
      { name: Chapter.name, schema: ChapterSchema },
      { name: Topic.name, schema: TopicSchema },
    ]),
  ],
  controllers: [AdminSchoolsController],
  providers: [AdminSchoolsService, MasterSeedService],
})
export class AdminSchoolsModule {}
