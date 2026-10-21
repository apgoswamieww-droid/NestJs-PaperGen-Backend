import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import type { AuthIdentity } from '../../auth/auth.types.js';
import {
  normalizePermissions,
  PERMISSION_CATALOG,
  SYSTEM_ROLE_KEYS,
} from '../../auth/permissions.js';
import { RolePermissionsService } from '../../auth/role-permissions.service.js';
import {
  RoleAudit,
  type RoleAuditAction,
  type RoleAuditDocument,
  type RoleAuditSnapshot,
} from '../../schemas/role-audit.schema.js';
import { Role, type RoleDocument } from '../../schemas/role.schema.js';
import { User } from '../../schemas/user.schema.js';
import type { CreateRoleDto } from './dto/create-role.dto.js';
import type { ListRoleAuditQueryDto } from './dto/list-role-audit-query.dto.js';
import type { ListRolesQueryDto } from './dto/list-roles-query.dto.js';
import type { UpdateRoleDto } from './dto/update-role.dto.js';
import type {
  RoleAuditPage,
  RoleAuditRecord,
  RoleOption,
  RoleRecord,
  RolesPage,
  RolesSummary,
} from './roles.types.js';

const MAX_KEY_ATTEMPTS = 50;
const MAX_KEY_LENGTH = 40;

interface ActorScope {
  tenantId: Types.ObjectId;
  actorId: Types.ObjectId;
}

@Injectable()
export class RolesService {
  constructor(
    private readonly rolePermissions: RolePermissionsService,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(RoleAudit.name)
    private readonly roleAuditModel: Model<RoleAudit>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async list(auth: AuthIdentity, query: ListRolesQueryDto): Promise<RolesPage> {
    const { tenantId } = this.scope(auth);

    await this.rolePermissions.ensureSystemRoles(tenantId);

    const filter: Record<string, unknown> = { tenantId };

    if (query.search) {
      filter['nameKey'] = new RegExp(escapeRegex(query.search.toLowerCase()));
    }

    const sort: Record<string, 1 | -1> = {
      [query.sort]: query.dir === 'asc' ? 1 : -1,
      _id: 1,
    };

    const [roles, total, counts] = await Promise.all([
      this.roleModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.roleModel.countDocuments(filter).exec(),
      this.userCounts(tenantId),
    ]);

    const summary: RolesSummary = {
      total: counts.totalRoles,
      system: counts.systemRoles,
      custom: counts.totalRoles - counts.systemRoles,
      assignedUsers: counts.assignedUsers,
    };

    return {
      items: roles.map((role) => this.toRecord(role, counts.byRole)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
      catalog: [...PERMISSION_CATALOG],
    };
  }

  async options(auth: AuthIdentity): Promise<RoleOption[]> {
    const { tenantId } = this.scope(auth);

    await this.rolePermissions.ensureSystemRoles(tenantId);

    const roles = await this.roleModel
      .find({ tenantId })
      .select('key name isSystem')
      .sort({ isSystem: -1, name: 1 })
      .exec();

    return roles.map((role) => ({
      key: role.key,
      name: role.name,
      isSystem: role.isSystem,
    }));
  }

  async create(auth: AuthIdentity, dto: CreateRoleDto): Promise<RoleRecord> {
    const { tenantId, actorId } = this.scope(auth);
    const nameKey = dto.name.toLowerCase();

    await this.ensureNameAvailable(tenantId, nameKey);

    const key = await this.pickKey(tenantId, dto.name);
    const permissions = normalizePermissions(dto.permissions ?? []);
    const role = await this.roleModel.create({
      tenantId,
      key,
      name: dto.name,
      nameKey,
      description: dto.description ?? '',
      permissions,
      isSystem: false,
    });

    await this.recordAudit(
      tenantId,
      actorId,
      'created',
      role,
      null,
      this.snapshot(role),
    );
    this.rolePermissions.invalidateTenant(tenantId.toString());

    return this.toRecord(role, (await this.userCounts(tenantId)).byRole);
  }

  async update(
    auth: AuthIdentity,
    key: string,
    dto: UpdateRoleDto,
  ): Promise<RoleRecord> {
    const { tenantId, actorId } = this.scope(auth);
    const role = await this.findRole(tenantId, key);
    const before = this.snapshot(role);

    if (role.isSystem && role.key === 'school_admin') {
      throw new BadRequestException(
        'The School admin role always has full access and cannot be changed.',
      );
    }

    const updates: Record<string, unknown> = {};

    if (dto.name !== undefined && dto.name !== role.name) {
      if (role.isSystem) {
        throw new BadRequestException('System roles cannot be renamed.');
      }

      const nameKey = dto.name.toLowerCase();

      await this.ensureNameAvailable(tenantId, nameKey, role._id);
      updates['name'] = dto.name;
      updates['nameKey'] = nameKey;
    }

    if (dto.description !== undefined) {
      updates['description'] = dto.description;
    }

    if (dto.permissions !== undefined) {
      updates['permissions'] = normalizePermissions(dto.permissions);
    }

    if (Object.keys(updates).length === 0) {
      return this.toRecord(role, (await this.userCounts(tenantId)).byRole);
    }

    const updated = await this.roleModel
      .findByIdAndUpdate(
        role._id,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Role not found.');
    }

    await this.recordAudit(
      tenantId,
      actorId,
      'updated',
      updated,
      before,
      this.snapshot(updated),
    );
    this.rolePermissions.invalidateTenant(tenantId.toString());

    return this.toRecord(updated, (await this.userCounts(tenantId)).byRole);
  }

  async remove(auth: AuthIdentity, key: string): Promise<void> {
    const { tenantId, actorId } = this.scope(auth);
    const role = await this.findRole(tenantId, key);

    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted.');
    }

    const assigned = await this.userModel
      .countDocuments({ tenantId, role: role.key })
      .exec();

    if (assigned > 0) {
      throw new ConflictException(
        `This role is assigned to ${assigned} user${assigned === 1 ? '' : 's'}. Reassign them before deleting it.`,
      );
    }

    await this.roleModel.deleteOne({ _id: role._id }).exec();
    await this.recordAudit(
      tenantId,
      actorId,
      'deleted',
      role,
      this.snapshot(role),
      null,
    );
    this.rolePermissions.invalidateTenant(tenantId.toString());
  }

  async audit(
    auth: AuthIdentity,
    query: ListRoleAuditQueryDto,
  ): Promise<RoleAuditPage> {
    const { tenantId } = this.scope(auth);
    const filter = { tenantId };

    const [entries, total] = await Promise.all([
      this.roleAuditModel
        .find(filter)
        .sort({ createdAt: -1, _id: 1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.roleAuditModel.countDocuments(filter).exec(),
    ]);

    return {
      items: entries.map((entry) => this.toAuditRecord(entry)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
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

  private async findRole(
    tenantId: Types.ObjectId,
    key: string,
  ): Promise<RoleDocument> {
    const role = await this.roleModel
      .findOne({ tenantId, key: key.toLowerCase() })
      .exec();

    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    return role;
  }

  private async ensureNameAvailable(
    tenantId: Types.ObjectId,
    nameKey: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: Record<string, unknown> = { tenantId, nameKey };

    if (excludeId) {
      filter['_id'] = { $ne: excludeId };
    }

    if (await this.roleModel.exists(filter)) {
      throw new ConflictException('A role with this name already exists.');
    }
  }

  private async pickKey(
    tenantId: Types.ObjectId,
    name: string,
  ): Promise<string> {
    const base = slugify(name);

    for (let attempt = 1; attempt <= MAX_KEY_ATTEMPTS; attempt += 1) {
      const candidate = withSuffix(base, attempt);

      if (
        (SYSTEM_ROLE_KEYS as readonly string[]).includes(candidate) ||
        (await this.roleModel.exists({ tenantId, key: candidate }))
      ) {
        continue;
      }

      return candidate;
    }

    throw new ConflictException(
      'Too many roles share a similar name. Please choose a different name.',
    );
  }

  private async userCounts(tenantId: Types.ObjectId): Promise<{
    byRole: Map<string, number>;
    totalRoles: number;
    systemRoles: number;
    assignedUsers: number;
  }> {
    const [rows, totalRoles, systemRoles] = await Promise.all([
      this.userModel
        .aggregate<{ _id: string; count: number }>([
          { $match: { tenantId } },
          { $group: { _id: '$role', count: { $sum: 1 } } },
        ])
        .exec(),
      this.roleModel.countDocuments({ tenantId }).exec(),
      this.roleModel.countDocuments({ tenantId, isSystem: true }).exec(),
    ]);

    const byRole = new Map(rows.map((row) => [row._id, row.count]));

    return {
      byRole,
      totalRoles,
      systemRoles,
      assignedUsers: rows.reduce((sum, row) => sum + row.count, 0),
    };
  }

  private async recordAudit(
    tenantId: Types.ObjectId,
    actorId: Types.ObjectId,
    action: RoleAuditAction,
    role: RoleDocument,
    before: RoleAuditSnapshot | null,
    after: RoleAuditSnapshot | null,
  ): Promise<void> {
    const actor = await this.userModel
      .findById(actorId)
      .select('name email')
      .exec();

    await this.roleAuditModel.create({
      tenantId,
      roleKey: role.key,
      roleName: role.name,
      action,
      actorId,
      actorName: actor?.name ?? 'Unknown user',
      actorEmail: actor?.email ?? '',
      before,
      after,
    });
  }

  private snapshot(role: RoleDocument): RoleAuditSnapshot {
    return {
      name: role.name,
      description: role.description,
      permissions: normalizePermissions(role.permissions),
    };
  }

  private toRecord(
    role: RoleDocument,
    byRole: Map<string, number>,
  ): RoleRecord {
    const createdAt = role.get('createdAt') as Date | undefined;
    const updatedAt = role.get('updatedAt') as Date | undefined;

    return {
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: normalizePermissions(role.permissions),
      isSystem: role.isSystem,
      userCount: byRole.get(role.key) ?? 0,
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? new Date()).toISOString(),
    };
  }

  private toAuditRecord(entry: RoleAuditDocument): RoleAuditRecord {
    const createdAt = entry.get('createdAt') as Date | undefined;

    return {
      id: entry._id.toString(),
      roleKey: entry.roleKey,
      roleName: entry.roleName,
      action: entry.action,
      actorName: entry.actorName,
      actorEmail: entry.actorEmail,
      before: entry.before ?? null,
      after: entry.after ?? null,
      createdAt: (createdAt ?? new Date()).toISOString(),
    };
  }
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_KEY_LENGTH)
    .replace(/_+$/g, '');

  return slug || 'role';
}

function withSuffix(base: string, attempt: number): string {
  if (attempt <= 1) {
    return base;
  }

  const suffix = `_${attempt}`;
  const trimmed = base
    .slice(0, Math.max(1, MAX_KEY_LENGTH - suffix.length))
    .replace(/_+$/g, '');

  return `${trimmed || 'role'}${suffix}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
