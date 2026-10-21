import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module.js';
import { MailModule } from '../../mail/mail.module.js';
import { Medium, MediumSchema } from '../../schemas/medium.schema.js';
import {
  PasswordResetToken,
  PasswordResetTokenSchema,
} from '../../schemas/password-reset-token.schema.js';
import {
  RefreshToken,
  RefreshTokenSchema,
} from '../../schemas/refresh-token.schema.js';
import { Subject, SubjectSchema } from '../../schemas/subject.schema.js';
import { Standard, StandardSchema } from '../../schemas/standard.schema.js';
import { Tenant, TenantSchema } from '../../schemas/tenant.schema.js';
import { User, UserSchema } from '../../schemas/user.schema.js';
import { SchoolUsersController } from './school-users.controller.js';
import { SchoolUsersService } from './school-users.service.js';
import { StudentImportService } from './student-import.service.js';

@Module({
  imports: [
    AuthModule,
    MailModule,
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: User.name, schema: UserSchema },
      { name: Subject.name, schema: SubjectSchema },
      { name: Medium.name, schema: MediumSchema },
      { name: Standard.name, schema: StandardSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: PasswordResetToken.name, schema: PasswordResetTokenSchema },
    ]),
  ],
  controllers: [SchoolUsersController],
  providers: [SchoolUsersService, StudentImportService],
})
export class SchoolUsersModule {}
