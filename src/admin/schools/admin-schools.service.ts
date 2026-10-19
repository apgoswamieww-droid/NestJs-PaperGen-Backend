import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import { Types, type Model } from 'mongoose';
import type { RequestMeta } from '../../auth/auth.types.js';
import { PasswordResetService } from '../../auth/password-reset.service.js';
import { PasswordService } from '../../auth/password.service.js';
import { TokensService } from '../../auth/tokens.service.js';
import type {
  PasswordInviteDetails,
  PasswordResetDetails,
} from '../../mail/mail.service.js';
import { MailService } from '../../mail/mail.service.js';
import { PasswordResetToken } from '../../schemas/password-reset-token.schema.js';
import {
  Plan,
  type BillingCycle,
  type SubscriptionStatus,
} from '../../schemas/plan.schema.js';
import { RefreshToken } from '../../schemas/refresh-token.schema.js';
import {
  Tenant,
  type TenantDocument,
  type TenantStatus,
} from '../../schemas/tenant.schema.js';
import { User, type UserDocument } from '../../schemas/user.schema.js';
import type {
  AdminSchoolDetail,
  AdminSchoolDetailResult,
  AdminSchoolStats,
  AdminSchoolSummary,
  AdminSchoolUser,
  CreateSchoolResult,
  ResendInviteResult,
  ResetPasswordSendResult,
} from './admin-schools.types.js';
import type { CreateSchoolDto } from './dto/create-school.dto.js';
import type { UpdateSchoolBillingDto } from './dto/update-school-billing.dto.js';
import type { UpdateSchoolDto } from './dto/update-school.dto.js';
import { slugify, withSlugSuffix } from './slug.js';

const MAX_SLUG_ATTEMPTS = 25;
const RECENT_USER_LIMIT = 5;
const DEFAULT_RENEWAL_DAYS = 30;
const RESERVED_SLUGS = new Set([
  'www',
  'api',
  'admin',
  'app',
  'mail',
  'smtp',
  'ftp',
  'ns',
  'cdn',
  'static',
  'assets',
  'dashboard',
  'school',
  'schools',
  'register',
  'login',
  'signup',
  'support',
  'help',
  'status',
  'docs',
  'billing',
  'blog',
  'dev',
  'staging',
  'test',
  'demo',
]);

const UPDATABLE_FIELDS = [
  'name',
  'slug',
  'type',
  'plan',
  'city',
  'phone',
  'email',
  'website',
  'addressLine1',
  'addressLine2',
  'state',
  'pincode',
  'country',
  'tagline',
  'brandColor',
  'logo',
  'board',
  'affiliationNumber',
  'principalName',
  'academicYear',
  'timezone',
] as const;

@Injectable()
export class AdminSchoolsService {
  private readonly logger = new Logger(AdminSchoolsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly passwordResetService: PasswordResetService,
    private readonly tokensService: TokensService,
    private readonly mailService: MailService,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<Tenant>,
    @InjectModel(Plan.name) private readonly planModel: Model<Plan>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshToken>,
    @InjectModel(PasswordResetToken.name)
    private readonly passwordResetTokenModel: Model<PasswordResetToken>,
  ) {}

  async list(): Promise<AdminSchoolSummary[]> {
    const [tenants, counts, plans] = await Promise.all([
      this.tenantModel.find().sort({ createdAt: -1 }).exec(),
      this.userModel
        .aggregate<{ _id: Types.ObjectId; count: number }>([
          { $group: { _id: '$tenantId', count: { $sum: 1 } } },
        ])
        .exec(),
      this.planModel.find().select('code name').exec(),
    ]);

    const countByTenant = new Map(
      counts.map((entry) => [entry._id.toString(), entry.count]),
    );
    const nameByPlan = new Map(plans.map((plan) => [plan.code, plan.name]));

    return tenants.map((tenant) =>
      this.toSummary(
        tenant,
        countByTenant.get(tenant._id.toString()) ?? 0,
        nameByPlan.get(tenant.plan) ?? tenant.plan,
      ),
    );
  }

  async detail(id: string): Promise<AdminSchoolDetailResult> {
    const tenant = await this.findTenantWithLogo(id);
    const users = await this.userModel
      .find({ tenantId: tenant._id })
      .select(
        'name email role status lastLoginAt lockedUntil passwordChangedAt createdAt',
      )
      .sort({ createdAt: 1 })
      .exec();
    const userIds = users.map((user) => user._id);
    const activeSessions = userIds.length
      ? await this.refreshTokenModel
          .countDocuments({
            subjectId: { $in: userIds },
            subjectType: 'app',
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          })
          .exec()
      : 0;
    const pendingInvites = userIds.length
      ? await this.passwordResetTokenModel
          .countDocuments({
            subjectId: { $in: userIds },
            subjectType: 'app',
            usedAt: null,
            expiresAt: { $gt: new Date() },
          })
          .exec()
      : 0;

    return {
      school: this.toDetail(tenant, await this.planNameFor(tenant.plan)),
      stats: this.buildStats(users, activeSessions, pendingInvites),
      recentUsers: this.buildRecentUsers(users),
    };
  }

  async create(
    dto: CreateSchoolDto,
    meta: RequestMeta,
  ): Promise<CreateSchoolResult> {
    await this.ensurePlan(dto.plan);

    if (await this.userModel.exists({ email: dto.adminEmail })) {
      throw new ConflictException('A user with this email already exists.');
    }

    const slug = await this.pickSlug(dto.name);
    const tenant = await this.createTenant(dto, slug);
    const user = await this.createSchoolAdmin(tenant._id, dto);
    const invite = await this.issueInvite(tenant, user, meta);

    return {
      school: this.toSummary(tenant, 1, await this.planNameFor(tenant.plan)),
      invite,
    };
  }

  async update(id: string, dto: UpdateSchoolDto): Promise<AdminSchoolSummary> {
    const tenant = await this.findTenant(id);

    if (dto.plan !== undefined) {
      await this.ensurePlan(dto.plan);
    }

    if (dto.slug !== undefined) {
      if (RESERVED_SLUGS.has(dto.slug)) {
        throw new ConflictException('This login domain is reserved.');
      }

      if (
        dto.slug !== tenant.slug &&
        (await this.tenantModel.exists({
          slug: dto.slug,
          _id: { $ne: tenant._id },
        }))
      ) {
        throw new ConflictException(
          'Another school already uses this login domain.',
        );
      }
    }

    const updates: Record<string, unknown> = {};

    for (const field of UPDATABLE_FIELDS) {
      if (dto[field] !== undefined) {
        updates[field] = dto[field];
      }
    }

    try {
      const updated = await this.tenantModel
        .findByIdAndUpdate(
          id,
          { $set: updates },
          { returnDocument: 'after', runValidators: true },
        )
        .exec();

      if (!updated) {
        throw new NotFoundException('School not found.');
      }

      const userCount = await this.userModel.countDocuments({
        tenantId: updated._id,
      });

      return this.toSummary(
        updated,
        userCount,
        await this.planNameFor(updated.plan),
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Another school already uses this login domain.',
        );
      }

      throw error;
    }
  }

  async updateStatus(
    id: string,
    status: TenantStatus,
  ): Promise<AdminSchoolSummary> {
    const tenant = await this.findTenant(id);
    const updated = await this.tenantModel
      .findByIdAndUpdate(
        tenant._id,
        { $set: { status } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('School not found.');
    }

    if (status === 'suspended') {
      await this.revokeTenantSessions(tenant._id);
    }

    const userCount = await this.userModel.countDocuments({
      tenantId: tenant._id,
    });

    return this.toSummary(
      updated,
      userCount,
      await this.planNameFor(updated.plan),
    );
  }

  async updateBilling(
    id: string,
    dto: UpdateSchoolBillingDto,
  ): Promise<AdminSchoolSummary> {
    const tenant = await this.findTenant(id);

    if (dto.plan !== undefined) {
      await this.ensurePlan(dto.plan);
    }

    const updates: Record<string, unknown> = {};

    if (dto.plan !== undefined) {
      updates.plan = dto.plan;
    }

    if (dto.billingCycle !== undefined) {
      updates.billingCycle = dto.billingCycle;
    }

    if (dto.subscriptionStatus !== undefined) {
      updates.subscriptionStatus = dto.subscriptionStatus;
    }

    if (dto.renewalAt !== undefined) {
      updates.renewalAt =
        dto.renewalAt === null ? null : new Date(dto.renewalAt);
    }

    if (dto.trialEndsAt !== undefined) {
      updates.trialEndsAt =
        dto.trialEndsAt === null ? null : new Date(dto.trialEndsAt);
    }

    if (dto.priceOverride !== undefined) {
      updates.priceOverride = dto.priceOverride;
    }

    const updated = await this.tenantModel
      .findByIdAndUpdate(
        tenant._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('School not found.');
    }

    const userCount = await this.userModel.countDocuments({
      tenantId: tenant._id,
    });

    return this.toSummary(
      updated,
      userCount,
      await this.planNameFor(updated.plan),
    );
  }

  async resendInvite(
    id: string,
    meta: RequestMeta,
  ): Promise<ResendInviteResult> {
    const tenant = await this.findTenant(id);
    const user = await this.userModel
      .findOne({
        tenantId: tenant._id,
        role: 'school_admin',
        passwordChangedAt: null,
      })
      .sort({ createdAt: 1 })
      .exec();

    if (!user) {
      throw new BadRequestException('No pending admin invitation to resend.');
    }

    return this.issueInvite(tenant, user, meta);
  }

  async resetPassword(
    id: string,
    meta: RequestMeta,
  ): Promise<ResetPasswordSendResult> {
    const tenant = await this.findTenant(id);
    const user = await this.userModel
      .findOne({
        tenantId: tenant._id,
        role: 'school_admin',
        status: 'active',
      })
      .sort({ createdAt: 1 })
      .exec();

    if (!user) {
      throw new BadRequestException('No active school admin account to reset.');
    }

    if (user.passwordChangedAt === null) {
      const invite = await this.issueInvite(tenant, user, meta);

      return { kind: 'invite', ...invite };
    }

    const { token, expiresInMinutes } = await this.passwordResetService.create(
      'app',
      user._id,
      user.email,
      meta,
    );
    const url = `${this.configService.getOrThrow<string>('mail.appUrl')}/reset-password?token=${encodeURIComponent(token)}`;
    const sent = await this.sendReset({
      to: user.email,
      name: user.name,
      url,
      scope: 'app',
      expiresInMinutes,
    });

    return { kind: 'reset', email: user.email, expiresInMinutes, sent };
  }

  private async ensurePlan(code: string): Promise<void> {
    if (!(await this.planModel.exists({ code }))) {
      throw new BadRequestException('Unknown plan.');
    }
  }

  private async planNameFor(code: string): Promise<string> {
    const plan = await this.planModel.findOne({ code }).select('name').exec();

    return plan?.name ?? code;
  }

  private async findTenant(id: string): Promise<TenantDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('School not found.');
    }

    const tenant = await this.tenantModel.findById(id).exec();

    if (!tenant) {
      throw new NotFoundException('School not found.');
    }

    return tenant;
  }

  private async findTenantWithLogo(id: string): Promise<TenantDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('School not found.');
    }

    const tenant = await this.tenantModel.findById(id).select('+logo').exec();

    if (!tenant) {
      throw new NotFoundException('School not found.');
    }

    return tenant;
  }

  private async issueInvite(
    tenant: TenantDocument,
    user: UserDocument,
    meta: RequestMeta,
  ): Promise<ResendInviteResult> {
    const expiresInHours = this.configService.getOrThrow<number>(
      'mail.inviteTtlHours',
    );
    const invite = await this.passwordResetService.create(
      'app',
      user._id,
      user.email,
      meta,
      expiresInHours * 60,
    );
    const url = `${this.configService.getOrThrow<string>('mail.appUrl')}/reset-password?token=${encodeURIComponent(invite.token)}`;
    const sent = await this.sendInvite({
      to: user.email,
      name: user.name,
      tenantName: tenant.name,
      url,
      expiresInHours,
    });

    return { email: user.email, expiresInHours, sent };
  }

  private async pickSlug(name: string): Promise<string> {
    const base = slugify(name);

    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidate = withSlugSuffix(base, attempt);

      if (
        !RESERVED_SLUGS.has(candidate) &&
        !(await this.tenantModel.exists({ slug: candidate }))
      ) {
        return candidate;
      }
    }

    throw new ConflictException(
      'Too many schools share a similar name. Please choose a different name.',
    );
  }

  private async createTenant(
    dto: CreateSchoolDto,
    slug: string,
  ): Promise<TenantDocument> {
    try {
      return await this.tenantModel.create({
        name: dto.name,
        slug,
        type: dto.type,
        city: dto.city ?? '',
        plan: dto.plan,
        status: 'active',
        renewalAt: new Date(
          Date.now() + DEFAULT_RENEWAL_DAYS * 24 * 60 * 60 * 1000,
        ),
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(
          'A school with the same name is being created. Please try again.',
        );
      }

      throw error;
    }
  }

  private async createSchoolAdmin(
    tenantId: Types.ObjectId,
    dto: CreateSchoolDto,
  ): Promise<UserDocument> {
    try {
      return await this.userModel.create({
        tenantId,
        email: dto.adminEmail,
        name: dto.adminName,
        role: 'school_admin',
        passwordHash: await this.passwordService.hash(
          randomBytes(32).toString('base64url'),
        ),
        status: 'active',
      });
    } catch (error) {
      await this.tenantModel.deleteOne({ _id: tenantId }).exec();

      if (isDuplicateKeyError(error)) {
        throw new ConflictException('A user with this email already exists.');
      }

      throw error;
    }
  }

  private async sendInvite(details: PasswordInviteDetails): Promise<boolean> {
    try {
      await this.mailService.sendPasswordInvite(details);

      return true;
    } catch (error) {
      this.logger.error(
        `Invitation email to ${details.to} failed. Invite link: ${details.url}`,
        error instanceof Error ? error.stack : undefined,
      );

      return false;
    }
  }

  private async sendReset(details: PasswordResetDetails): Promise<boolean> {
    try {
      await this.mailService.sendPasswordReset(details);

      return true;
    } catch (error) {
      this.logger.error(
        `Password reset email to ${details.to} failed. Reset link: ${details.url}`,
        error instanceof Error ? error.stack : undefined,
      );

      return false;
    }
  }

  private async revokeTenantSessions(tenantId: Types.ObjectId): Promise<void> {
    const users = await this.userModel.find({ tenantId }).select('_id').exec();

    await Promise.all(
      users.map((user) =>
        this.tokensService.revokeAllForSubject(user._id, 'app'),
      ),
    );
  }

  private buildStats(
    users: UserDocument[],
    activeSessions: number,
    pendingInvites: number,
  ): AdminSchoolStats {
    const now = Date.now();
    const logins = users
      .map((user) => user.lastLoginAt?.getTime() ?? null)
      .filter((value): value is number => value !== null);

    return {
      totalUsers: users.length,
      activeUsers: users.filter((user) => user.status === 'active').length,
      suspendedUsers: users.filter((user) => user.status === 'suspended')
        .length,
      lockedUsers: users.filter(
        (user) => user.lockedUntil !== null && user.lockedUntil.getTime() > now,
      ).length,
      pendingSetupUsers: users.filter((user) => user.passwordChangedAt === null)
        .length,
      activeSessions,
      pendingInvites,
      schoolAdmins: users.filter((user) => user.role === 'school_admin').length,
      teachers: users.filter((user) => user.role === 'teacher').length,
      staff: users.filter((user) => user.role === 'staff').length,
      students: users.filter((user) => user.role === 'student').length,
      lastLoginAt: logins.length
        ? new Date(Math.max(...logins)).toISOString()
        : null,
    };
  }

  private buildRecentUsers(users: UserDocument[]): AdminSchoolUser[] {
    return [...users]
      .sort(
        (a, b) =>
          (b.lastLoginAt?.getTime() ?? 0) - (a.lastLoginAt?.getTime() ?? 0),
      )
      .slice(0, RECENT_USER_LIMIT)
      .map((user) => this.toDetailUser(user));
  }

  private billingOf(tenant: TenantDocument): {
    billingCycle: BillingCycle;
    subscriptionStatus: SubscriptionStatus;
    renewalAt: string | null;
    trialEndsAt: string | null;
    priceOverride: number | null;
  } {
    return {
      billingCycle: tenant.billingCycle ?? 'monthly',
      subscriptionStatus: tenant.subscriptionStatus ?? 'active',
      renewalAt: tenant.renewalAt ? tenant.renewalAt.toISOString() : null,
      trialEndsAt: tenant.trialEndsAt ? tenant.trialEndsAt.toISOString() : null,
      priceOverride: tenant.priceOverride ?? null,
    };
  }

  private toSummary(
    tenant: TenantDocument,
    userCount: number,
    planName: string,
  ): AdminSchoolSummary {
    const createdAt = tenant.get('createdAt') as Date | undefined;

    return {
      id: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
      type: tenant.type ?? 'school',
      city: tenant.city ?? '',
      plan: tenant.plan,
      planName,
      status: tenant.status,
      brandColor: tenant.brandColor ?? '#73113a',
      userCount,
      ...this.billingOf(tenant),
      createdAt: (createdAt ?? new Date()).toISOString(),
    };
  }

  private toDetail(
    tenant: TenantDocument,
    planName: string,
  ): AdminSchoolDetail {
    const createdAt = tenant.get('createdAt') as Date | undefined;
    const updatedAt = tenant.get('updatedAt') as Date | undefined;

    return {
      id: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
      type: tenant.type ?? 'school',
      plan: tenant.plan,
      planName,
      status: tenant.status,
      ...this.billingOf(tenant),
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? createdAt ?? new Date()).toISOString(),
      phone: tenant.phone ?? '',
      email: tenant.email ?? '',
      website: tenant.website ?? '',
      addressLine1: tenant.addressLine1 ?? '',
      addressLine2: tenant.addressLine2 ?? '',
      city: tenant.city ?? '',
      state: tenant.state ?? '',
      pincode: tenant.pincode ?? '',
      country: tenant.country ?? '',
      tagline: tenant.tagline ?? '',
      brandColor: tenant.brandColor ?? '#73113a',
      logo: tenant.logo ?? '',
      board: tenant.board ?? '',
      affiliationNumber: tenant.affiliationNumber ?? '',
      principalName: tenant.principalName ?? '',
      academicYear: tenant.academicYear ?? '',
      timezone: tenant.timezone ?? 'Asia/Kolkata',
    };
  }

  private toDetailUser(user: UserDocument): AdminSchoolUser {
    const createdAt = user.get('createdAt') as Date | undefined;

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      setupPending: user.passwordChangedAt === null,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: (createdAt ?? new Date()).toISOString(),
    };
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}
