import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from '../mail/mail.module.js';
import {
  PasswordResetToken,
  PasswordResetTokenSchema,
} from '../schemas/password-reset-token.schema.js';
import {
  PlatformAdmin,
  PlatformAdminSchema,
} from '../schemas/platform-admin.schema.js';
import {
  RefreshToken,
  RefreshTokenSchema,
} from '../schemas/refresh-token.schema.js';
import { Tenant, TenantSchema } from '../schemas/tenant.schema.js';
import { User, UserSchema } from '../schemas/user.schema.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { PasswordService } from './password.service.js';
import { TokensService } from './tokens.service.js';

@Module({
  imports: [
    JwtModule.register({}),
    MailModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: PlatformAdmin.name, schema: PlatformAdminSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: PasswordResetToken.name, schema: PasswordResetTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokensService,
    PasswordResetService,
  ],
  exports: [AuthService, PasswordService, TokensService, PasswordResetService],
})
export class AuthModule {}
