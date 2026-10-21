import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { MailService } from '../mail/mail.service.js';
import {
  PlatformAdmin,
  type PlatformAdminDocument,
} from '../schemas/platform-admin.schema.js';
import { Tenant, type TenantDocument } from '../schemas/tenant.schema.js';
import { User, type UserDocument } from '../schemas/user.schema.js';
import type {
  AuthScope,
  RequestMeta,
  SessionResponse,
  SessionUser,
} from './auth.types.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { isPasswordExpired } from './password-expiry.js';
import { PasswordResetService } from './password-reset.service.js';
import { PasswordService } from './password.service.js';
import type { Permission } from './permissions.js';
import { RolePermissionsService } from './role-permissions.service.js';
import { TokensService, type RefreshIssue } from './tokens.service.js';

const LOCKED_STATUS = 423;

export const FORGOT_PASSWORD_MESSAGE =
  'If that email is registered, a reset link is on its way.';

export interface AuthSession {
  session: SessionResponse;
  refresh: RefreshIssue;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly tokensService: TokensService,
    private readonly passwordResetService: PasswordResetService,
    private readonly rolePermissions: RolePermissionsService,
    private readonly mailService: MailService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<Tenant>,
    @InjectModel(PlatformAdmin.name)
    private readonly platformAdminModel: Model<PlatformAdmin>,
  ) {}

  login(
    scope: AuthScope,
    dto: LoginDto,
    meta: RequestMeta,
  ): Promise<AuthSession> {
    return scope === 'admin'
      ? this.loginPlatformAdmin(dto, meta)
      : this.loginSchool(dto, meta);
  }

  async refresh(
    scope: AuthScope,
    rawToken: string | null,
    meta: RequestMeta,
  ): Promise<AuthSession> {
    if (!rawToken) {
      throw invalidSession();
    }

    const rotated = await this.tokensService.rotateRefreshToken(
      rawToken,
      scope,
      meta,
    );

    if (!rotated.ok) {
      throw invalidSession();
    }

    if (scope === 'admin') {
      const admin = await this.findActiveAdmin(rotated.subjectId);

      if (!admin) {
        throw invalidSession();
      }

      const accessToken = await this.tokensService.issueAccessToken(
        { id: admin._id.toString(), role: admin.role },
        'admin',
      );

      return {
        session: { accessToken, user: toAdminSessionUser(admin) },
        refresh: { token: rotated.token, expiresAt: rotated.expiresAt },
      };
    }

    const user = await this.findActiveUser(rotated.subjectId);

    if (!user) {
      throw invalidSession();
    }

    const tenant = await this.tenantModel.findById(user.tenantId).exec();
    const permissions = await this.rolePermissions.permissionsForRole(
      user.tenantId,
      user.role,
    );
    const accessToken = await this.tokensService.issueAccessToken(
      {
        id: user._id.toString(),
        role: user.role,
        tenantId: user.tenantId.toString(),
      },
      'app',
    );

    return {
      session: {
        accessToken,
        user: toSessionUser(
          user,
          tenant,
          permissions,
          this.isPasswordExpired(user),
        ),
      },
      refresh: { token: rotated.token, expiresAt: rotated.expiresAt },
    };
  }

  async logout(scope: AuthScope, rawToken: string | null): Promise<void> {
    if (rawToken) {
      await this.tokensService.revokeRefreshToken(rawToken, scope);
    }
  }

  /**
   * Always resolves without revealing whether the email is registered. The
   * response time is padded on the miss path so it does not give the account
   * existence away either.
   */
  async forgotPassword(
    scope: AuthScope,
    dto: ForgotPasswordDto,
    meta: RequestMeta,
  ): Promise<void> {
    if (scope === 'admin') {
      const admin = await this.platformAdminModel
        .findOne({ email: dto.email })
        .exec();

      if (!admin || admin.status !== 'active') {
        await this.passwordService.verify(undefined, dto.email);
        return;
      }

      await this.sendResetLink(scope, admin._id, admin.email, admin.name, meta);
      return;
    }

    const user = await this.userModel.findOne({ email: dto.email }).exec();

    if (!user || user.status !== 'active') {
      await this.passwordService.verify(undefined, dto.email);
      return;
    }

    await this.sendResetLink(
      scope,
      user._id,
      user.email ?? '',
      user.name,
      meta,
    );
  }

  async resetPassword(scope: AuthScope, dto: ResetPasswordDto): Promise<void> {
    const subjectId = await this.passwordResetService.redeem(dto.token, scope);

    if (!subjectId) {
      throw invalidResetLink();
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const update = {
      $set: {
        passwordHash,
        passwordChangedAt: new Date(),
        failedAttempts: 0,
        lockedUntil: null,
      },
    };
    const result =
      scope === 'admin'
        ? await this.platformAdminModel
            .updateOne({ _id: subjectId, status: 'active' }, update)
            .exec()
        : await this.userModel
            .updateOne({ _id: subjectId, status: 'active' }, update)
            .exec();

    if (result.matchedCount === 0) {
      throw invalidResetLink();
    }

    await this.tokensService.revokeAllForSubject(subjectId, scope);
    this.rolePermissions.invalidateUser(subjectId.toString());
  }

  async changePassword(
    subjectId: string,
    dto: ChangePasswordDto,
    meta: RequestMeta,
  ): Promise<AuthSession> {
    if (!Types.ObjectId.isValid(subjectId)) {
      throw invalidSession();
    }

    const user = await this.userModel
      .findById(subjectId)
      .select('+passwordHash')
      .exec();

    if (!user || user.status !== 'active') {
      throw invalidSession();
    }

    const tenant = await this.tenantModel.findById(user.tenantId).exec();

    if (tenant?.status === 'suspended') {
      throw invalidSession();
    }

    const currentOk = await this.passwordService.verify(
      user.passwordHash,
      dto.currentPassword,
    );

    if (!currentOk) {
      throw new BadRequestException('Your current password is incorrect.');
    }

    const reused = await this.passwordService.verify(
      user.passwordHash,
      dto.newPassword,
    );

    if (reused) {
      throw new BadRequestException(
        'New password must be different from your current password.',
      );
    }

    const passwordHash = await this.passwordService.hash(dto.newPassword);

    await this.userModel
      .updateOne(
        { _id: user._id },
        {
          $set: {
            passwordHash,
            passwordChangedAt: new Date(),
            failedAttempts: 0,
            lockedUntil: null,
          },
        },
      )
      .exec();

    await this.tokensService.revokeAllForSubject(user._id, 'app');
    this.rolePermissions.invalidateUser(user._id.toString());

    const permissions = await this.rolePermissions.permissionsForRole(
      user.tenantId,
      user.role,
    );
    const accessToken = await this.tokensService.issueAccessToken(
      {
        id: user._id.toString(),
        role: user.role,
        tenantId: user.tenantId.toString(),
      },
      'app',
    );
    const refresh = await this.tokensService.issueRefreshToken(
      user._id,
      'app',
      false,
      meta,
    );

    return {
      session: {
        accessToken,
        user: toSessionUser(user, tenant, permissions, false),
      },
      refresh,
    };
  }

  private async sendResetLink(
    scope: AuthScope,
    subjectId: Types.ObjectId,
    email: string,
    name: string,
    meta: RequestMeta,
  ): Promise<void> {
    const { token, expiresInMinutes } = await this.passwordResetService.create(
      scope,
      subjectId,
      email,
      meta,
    );
    const baseUrl = this.configService.getOrThrow<string>('mail.appUrl');
    const path =
      scope === 'admin' ? '/admin/reset-password' : '/reset-password';

    await this.mailService.sendPasswordReset({
      to: email,
      name,
      url: `${baseUrl}${path}?token=${encodeURIComponent(token)}`,
      scope,
      expiresInMinutes,
    });
  }

  async me(scope: AuthScope, subjectId: string): Promise<SessionUser> {
    if (!Types.ObjectId.isValid(subjectId)) {
      throw invalidSession();
    }

    if (scope === 'admin') {
      const admin = await this.findActiveAdmin(subjectId);

      if (!admin) {
        throw invalidSession();
      }

      return toAdminSessionUser(admin);
    }

    const user = await this.findActiveUser(subjectId);

    if (!user) {
      throw invalidSession();
    }

    const tenant = await this.tenantModel.findById(user.tenantId).exec();
    const permissions = await this.rolePermissions.permissionsForRole(
      user.tenantId,
      user.role,
    );

    return toSessionUser(
      user,
      tenant,
      permissions,
      this.isPasswordExpired(user),
    );
  }

  private async loginSchool(
    dto: LoginDto,
    meta: RequestMeta,
  ): Promise<AuthSession> {
    const user = await this.userModel
      .findOne({ email: dto.email })
      .select('+passwordHash')
      .exec();

    if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw locked(user.lockedUntil);
    }

    const passwordOk = await this.passwordService.verify(
      user?.passwordHash,
      dto.password,
    );

    if (!user || !passwordOk) {
      if (user) {
        await this.registerUserFailedAttempt(user);
      }

      throw invalidCredentials();
    }

    if (user.status !== 'active') {
      throw new ForbiddenException('This account has been suspended.');
    }

    const tenant = await this.tenantModel.findById(user.tenantId).exec();

    if (tenant?.status === 'suspended') {
      throw new ForbiddenException('This school account has been suspended.');
    }

    await this.userModel
      .updateOne(
        { _id: user._id },
        {
          $set: {
            failedAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        },
      )
      .exec();

    const accessToken = await this.tokensService.issueAccessToken(
      {
        id: user._id.toString(),
        role: user.role,
        tenantId: user.tenantId.toString(),
      },
      'app',
    );
    const permissions = await this.rolePermissions.permissionsForRole(
      user.tenantId,
      user.role,
    );
    const refresh = await this.tokensService.issueRefreshToken(
      user._id,
      'app',
      dto.remember ?? false,
      meta,
    );

    return {
      session: {
        accessToken,
        user: toSessionUser(
          user,
          tenant,
          permissions,
          this.isPasswordExpired(user),
        ),
      },
      refresh,
    };
  }

  private async loginPlatformAdmin(
    dto: LoginDto,
    meta: RequestMeta,
  ): Promise<AuthSession> {
    const admin = await this.platformAdminModel
      .findOne({ email: dto.email })
      .select('+passwordHash')
      .exec();

    if (admin?.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      throw locked(admin.lockedUntil);
    }

    const passwordOk = await this.passwordService.verify(
      admin?.passwordHash,
      dto.password,
    );

    if (!admin || !passwordOk) {
      if (admin) {
        await this.registerAdminFailedAttempt(admin);
      }

      throw invalidCredentials();
    }

    if (admin.status !== 'active') {
      throw new ForbiddenException('This account has been suspended.');
    }

    await this.platformAdminModel
      .updateOne(
        { _id: admin._id },
        {
          $set: {
            failedAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        },
      )
      .exec();

    const accessToken = await this.tokensService.issueAccessToken(
      { id: admin._id.toString(), role: admin.role },
      'admin',
    );
    const refresh = await this.tokensService.issueRefreshToken(
      admin._id,
      'admin',
      dto.remember ?? false,
      meta,
    );

    return {
      session: { accessToken, user: toAdminSessionUser(admin) },
      refresh,
    };
  }

  private async registerUserFailedAttempt(user: UserDocument): Promise<void> {
    const limit = this.configService.getOrThrow<number>('auth.lockoutAttempts');
    const updated = await this.userModel
      .findByIdAndUpdate(
        user._id,
        { $inc: { failedAttempts: 1 } },
        { returnDocument: 'after' },
      )
      .exec();

    if (updated && updated.failedAttempts >= limit) {
      const minutes = this.configService.getOrThrow<number>(
        'auth.lockoutMinutes',
      );

      await this.userModel
        .updateOne(
          { _id: user._id },
          {
            $set: {
              failedAttempts: 0,
              lockedUntil: new Date(Date.now() + minutes * 60_000),
            },
          },
        )
        .exec();
    }
  }

  private async registerAdminFailedAttempt(
    admin: PlatformAdminDocument,
  ): Promise<void> {
    const limit = this.configService.getOrThrow<number>('auth.lockoutAttempts');
    const updated = await this.platformAdminModel
      .findByIdAndUpdate(
        admin._id,
        { $inc: { failedAttempts: 1 } },
        { returnDocument: 'after' },
      )
      .exec();

    if (updated && updated.failedAttempts >= limit) {
      const minutes = this.configService.getOrThrow<number>(
        'auth.lockoutMinutes',
      );

      await this.platformAdminModel
        .updateOne(
          { _id: admin._id },
          {
            $set: {
              failedAttempts: 0,
              lockedUntil: new Date(Date.now() + minutes * 60_000),
            },
          },
        )
        .exec();
    }
  }

  private isPasswordExpired(user: UserDocument): boolean {
    return isPasswordExpired(
      user.passwordChangedAt,
      this.configService.getOrThrow<number>('auth.passwordMaxAgeDays'),
    );
  }

  private async findActiveUser(
    subjectId: string,
  ): Promise<UserDocument | null> {
    const user = await this.userModel.findById(subjectId).exec();

    if (!user || user.status !== 'active') {
      return null;
    }

    const tenant = await this.tenantModel.findById(user.tenantId).exec();

    if (tenant?.status === 'suspended') {
      return null;
    }

    return user;
  }

  private async findActiveAdmin(
    subjectId: string,
  ): Promise<PlatformAdminDocument | null> {
    const admin = await this.platformAdminModel.findById(subjectId).exec();

    return admin && admin.status === 'active' ? admin : null;
  }
}

function toSessionUser(
  user: UserDocument,
  tenant: TenantDocument | null,
  permissions: Permission[],
  passwordExpired: boolean,
): SessionUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email ?? '',
    role: user.role,
    tenantId: user.tenantId.toString(),
    tenantName: tenant?.name,
    permissions,
    passwordExpired,
  };
}

function toAdminSessionUser(admin: PlatformAdminDocument): SessionUser {
  return {
    id: admin._id.toString(),
    name: admin.name,
    email: admin.email,
    role: admin.role,
  };
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException('Invalid email or password.');
}

function invalidResetLink(): BadRequestException {
  return new BadRequestException(
    'This reset link is invalid or has expired. Please request a new one.',
  );
}

function invalidSession(): UnauthorizedException {
  return new UnauthorizedException('Session expired. Please sign in again.');
}

function locked(lockedUntil: Date): HttpException {
  const minutes = Math.max(
    1,
    Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000),
  );

  return new HttpException(
    `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    LOCKED_STATUS,
  );
}
