import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model, type QueryFilter } from 'mongoose';
import type { AuthIdentity } from '../../auth/auth.types.js';
import { PasswordService } from '../../auth/password.service.js';
import { TokensService } from '../../auth/tokens.service.js';
import type { CredentialsDetails } from '../../mail/mail.service.js';
import { MailService } from '../../mail/mail.service.js';
import { PasswordResetToken } from '../../schemas/password-reset-token.schema.js';
import { RefreshToken } from '../../schemas/refresh-token.schema.js';
import { Tenant, type TenantDocument } from '../../schemas/tenant.schema.js';
import {
  User,
  type AccountStatus,
  type UserDocument,
  type UserRole,
} from '../../schemas/user.schema.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import type {
  CreateUserResult,
  GeneratedCredentials,
  SchoolUserRecord,
  SchoolUsersPage,
  SchoolUsersSummary,
} from './school-users.types.js';

interface ActorScope {
  tenantId: Types.ObjectId;
  actorId: Types.ObjectId;
}

@Injectable()
export class SchoolUsersService {
  private readonly logger = new Logger(SchoolUsersService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly tokensService: TokensService,
    private readonly mailService: MailService,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<Tenant>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshToken>,
    @InjectModel(PasswordResetToken.name)
    private readonly passwordResetTokenModel: Model<PasswordResetToken>,
  ) {}

  async list(
    auth: AuthIdentity,
    query: ListUsersQueryDto,
  ): Promise<SchoolUsersPage> {
    const { tenantId } = this.scope(auth);
    const filter: QueryFilter<User> = { tenantId };

    if (query.search) {
      const pattern = new RegExp(escapeRegex(query.search), 'i');

      filter.$or = [{ name: pattern }, { email: pattern }];
    }

    if (query.role) {
      filter.role = query.role;
    }

    if (query.status) {
      filter.status = query.status;
    }

    const sort: Record<string, 1 | -1> = {
      [query.sort]: query.dir === 'asc' ? 1 : -1,
      _id: 1,
    };

    const [users, total, summary] = await Promise.all([
      this.userModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.userModel.countDocuments(filter).exec(),
      this.buildSummary(tenantId),
    ]);

    return {
      items: users.map((user) => this.toRecord(user)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
    };
  }

  async detail(auth: AuthIdentity, id: string): Promise<SchoolUserRecord> {
    const { tenantId } = this.scope(auth);
    const user = await this.findUser(tenantId, id);

    return this.toRecord(user);
  }

  async create(
    auth: AuthIdentity,
    dto: CreateUserDto,
  ): Promise<CreateUserResult> {
    const { tenantId } = this.scope(auth);

    if (await this.userModel.exists({ email: dto.email })) {
      throw new ConflictException('A user with this email already exists.');
    }

    const tenant = await this.tenantModel.findById(tenantId).exec();

    if (!tenant) {
      throw new NotFoundException('School not found.');
    }

    const password = this.passwordService.generate();

    let user: UserDocument;

    try {
      user = await this.userModel.create({
        tenantId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone ?? '',
        role: dto.role,
        passwordHash: await this.passwordService.hash(password),
        status: 'active',
        passwordChangedAt: new Date(),
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('A user with this email already exists.');
      }

      throw error;
    }

    const sent = await this.sendCredentials(tenant, user, password);

    return {
      user: this.toRecord(user),
      credentials: { email: user.email, password, sent },
    };
  }

  async update(
    auth: AuthIdentity,
    id: string,
    dto: UpdateUserDto,
  ): Promise<SchoolUserRecord> {
    const { tenantId, actorId } = this.scope(auth);
    const user = await this.findUser(tenantId, id);

    if (dto.role !== undefined && dto.role !== user.role) {
      if (user._id.equals(actorId)) {
        throw new BadRequestException('You cannot change your own role.');
      }

      await this.ensureAdminRemains(tenantId, user);
    }

    if (dto.email !== undefined && dto.email !== user.email) {
      if (
        await this.userModel.exists({
          email: dto.email,
          _id: { $ne: user._id },
        })
      ) {
        throw new ConflictException('A user with this email already exists.');
      }
    }

    const updates: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      updates['name'] = dto.name;
    }

    if (dto.email !== undefined) {
      updates['email'] = dto.email;
    }

    if (dto.phone !== undefined) {
      updates['phone'] = dto.phone;
    }

    if (dto.role !== undefined) {
      updates['role'] = dto.role;
    }

    try {
      const updated = await this.userModel
        .findByIdAndUpdate(
          user._id,
          { $set: updates },
          { returnDocument: 'after', runValidators: true },
        )
        .exec();

      if (!updated) {
        throw new NotFoundException('User not found.');
      }

      return this.toRecord(updated);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('A user with this email already exists.');
      }

      throw error;
    }
  }

  async updateStatus(
    auth: AuthIdentity,
    id: string,
    status: AccountStatus,
  ): Promise<SchoolUserRecord> {
    const { tenantId, actorId } = this.scope(auth);
    const user = await this.findUser(tenantId, id);

    if (status === 'suspended') {
      if (user._id.equals(actorId)) {
        throw new BadRequestException('You cannot suspend your own account.');
      }

      await this.ensureAdminRemains(tenantId, user);
    }

    const updated = await this.userModel
      .findByIdAndUpdate(
        user._id,
        { $set: { status } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('User not found.');
    }

    if (status === 'suspended') {
      await this.tokensService.revokeAllForSubject(user._id, 'app');
    }

    return this.toRecord(updated);
  }

  async resetPassword(
    auth: AuthIdentity,
    id: string,
  ): Promise<GeneratedCredentials> {
    const { tenantId } = this.scope(auth);
    const user = await this.findUser(tenantId, id);
    const tenant = await this.tenantModel.findById(tenantId).exec();

    if (!tenant) {
      throw new NotFoundException('School not found.');
    }

    const password = this.passwordService.generate();
    const passwordHash = await this.passwordService.hash(password);

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

    const sent = await this.sendCredentials(tenant, user, password);

    return { email: user.email, password, sent };
  }

  async remove(auth: AuthIdentity, id: string): Promise<void> {
    const { tenantId, actorId } = this.scope(auth);
    const user = await this.findUser(tenantId, id);

    if (user._id.equals(actorId)) {
      throw new BadRequestException('You cannot delete your own account.');
    }

    await this.ensureAdminRemains(tenantId, user);
    await this.tokensService.revokeAllForSubject(user._id, 'app');

    await Promise.all([
      this.refreshTokenModel
        .deleteMany({ subjectId: user._id, subjectType: 'app' })
        .exec(),
      this.passwordResetTokenModel
        .deleteMany({ subjectId: user._id, subjectType: 'app' })
        .exec(),
    ]);
    await this.userModel.deleteOne({ _id: user._id }).exec();
  }

  private scope(auth: AuthIdentity): ActorScope {
    if (!auth.tenantId || !Types.ObjectId.isValid(auth.tenantId)) {
      throw new UnauthorizedException('Tenant context missing.');
    }

    return {
      tenantId: new Types.ObjectId(auth.tenantId),
      actorId: new Types.ObjectId(auth.id),
    };
  }

  private async findUser(
    tenantId: Types.ObjectId,
    id: string,
  ): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('User not found.');
    }

    const user = await this.userModel.findOne({ _id: id, tenantId }).exec();

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return user;
  }

  private async ensureAdminRemains(
    tenantId: Types.ObjectId,
    target: UserDocument,
  ): Promise<void> {
    if (target.role !== 'school_admin' || target.status !== 'active') {
      return;
    }

    const others = await this.userModel
      .countDocuments({
        tenantId,
        role: 'school_admin',
        status: 'active',
        _id: { $ne: target._id },
      })
      .exec();

    if (others === 0) {
      throw new BadRequestException(
        'At least one active school admin is required.',
      );
    }
  }

  private async buildSummary(
    tenantId: Types.ObjectId,
  ): Promise<SchoolUsersSummary> {
    const rows = await this.userModel
      .aggregate<{
        _id: { role: UserRole; status: AccountStatus };
        count: number;
      }>([
        { $match: { tenantId } },
        {
          $group: {
            _id: { role: '$role', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    const summary: SchoolUsersSummary = {
      totalUsers: 0,
      activeUsers: 0,
      suspendedUsers: 0,
      schoolAdmins: 0,
      teachers: 0,
      staff: 0,
      students: 0,
    };

    const roleKeys: Record<UserRole, keyof SchoolUsersSummary> = {
      school_admin: 'schoolAdmins',
      teacher: 'teachers',
      staff: 'staff',
      student: 'students',
    };

    for (const row of rows) {
      summary.totalUsers += row.count;

      if (row._id.status === 'active') {
        summary.activeUsers += row.count;
      } else {
        summary.suspendedUsers += row.count;
      }

      const key = roleKeys[row._id.role];

      summary[key] += row.count;
    }

    return summary;
  }

  private async sendCredentials(
    tenant: TenantDocument,
    user: UserDocument,
    password: string,
  ): Promise<boolean> {
    const details: CredentialsDetails = {
      to: user.email,
      name: user.name,
      tenantName: tenant.name,
      email: user.email,
      password,
      url: `${this.configService.getOrThrow<string>('mail.appUrl')}/login`,
    };

    try {
      await this.mailService.sendCredentials(details);

      return true;
    } catch (error) {
      this.logger.error(
        `Credentials email to ${details.to} failed for ${tenant.name}.`,
        error instanceof Error ? error.stack : undefined,
      );

      return false;
    }
  }

  private toRecord(user: UserDocument): SchoolUserRecord {
    const createdAt = user.get('createdAt') as Date | undefined;

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: (createdAt ?? new Date()).toISOString(),
    };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}
