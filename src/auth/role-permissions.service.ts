import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Role, type RoleDocument } from '../schemas/role.schema.js';
import { User } from '../schemas/user.schema.js';
import { isPasswordExpired } from './password-expiry.js';
import {
  defaultPermissionsFor,
  normalizePermissions,
  PERMISSIONS,
  SYSTEM_ROLE_DEFINITIONS,
  type Permission,
} from './permissions.js';

const CACHE_TTL_MS = 30_000;

interface TenantRoleCache {
  roles: Map<string, Permission[]>;
  expiresAt: number;
}

interface UserAccessCache extends UserAccess {
  expiresAt: number;
}

export interface UserAccess {
  tenantId: string;
  role: string;
  permissions: Permission[];
  passwordExpired: boolean;
}

@Injectable()
export class RolePermissionsService {
  private readonly tenantCache = new Map<string, TenantRoleCache>();
  private readonly userCache = new Map<string, UserAccessCache>();

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async resolveAccess(userId: string): Promise<UserAccess | null> {
    const cached = this.userCache.get(userId);

    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return {
        tenantId: cached.tenantId,
        role: cached.role,
        permissions: cached.permissions,
        passwordExpired: cached.passwordExpired,
      };
    }

    return this.loadAccess(userId);
  }

  async permissionsForRole(
    tenantId: Types.ObjectId | string,
    roleKey: string,
  ): Promise<Permission[]> {
    const roles = await this.rolesForTenant(tenantId);

    return roles.get(roleKey) ?? defaultPermissionsFor(roleKey);
  }

  async ensureSystemRoles(tenantId: Types.ObjectId): Promise<void> {
    for (const definition of SYSTEM_ROLE_DEFINITIONS) {
      try {
        await this.roleModel
          .updateOne(
            { tenantId, key: definition.key },
            {
              $setOnInsert: {
                tenantId,
                key: definition.key,
                name: definition.name,
                nameKey: definition.name.toLowerCase(),
                description: definition.description,
                permissions: [...definition.permissions],
                isSystem: true,
              },
            },
            { upsert: true },
          )
          .exec();
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }

    await this.roleModel
      .updateOne(
        { tenantId, key: 'school_admin' },
        { $set: { permissions: [...PERMISSIONS], isSystem: true } },
      )
      .exec();

    this.invalidateTenant(tenantId.toString());
  }

  async rolesForTenant(
    tenantId: Types.ObjectId | string,
  ): Promise<Map<string, Permission[]>> {
    const key = tenantId.toString();
    const cached = this.tenantCache.get(key);

    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return cached.roles;
    }

    const roles = await this.roleModel
      .find({ tenantId: new Types.ObjectId(key) })
      .select('key permissions')
      .exec();
    const map = new Map<string, Permission[]>();

    for (const role of roles) {
      map.set(role.key, normalizePermissions(role.permissions));
    }

    this.tenantCache.set(key, {
      roles: map,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return map;
  }

  invalidateTenant(tenantId: string): void {
    this.tenantCache.delete(tenantId);

    for (const [userId, entry] of this.userCache) {
      if (entry.tenantId === tenantId) {
        this.userCache.delete(userId);
      }
    }
  }

  invalidateUser(userId: string): void {
    this.userCache.delete(userId);
  }

  private async loadAccess(userId: string): Promise<UserAccess | null> {
    if (!Types.ObjectId.isValid(userId)) {
      return null;
    }

    const user = await this.userModel
      .findById(userId)
      .select('tenantId role status passwordChangedAt')
      .exec();

    if (!user || user.status !== 'active') {
      return null;
    }

    const tenantId = user.tenantId.toString();
    const permissions = await this.permissionsForRole(tenantId, user.role);
    const access: UserAccess = {
      tenantId,
      role: user.role,
      permissions,
      passwordExpired: isPasswordExpired(
        user.passwordChangedAt,
        this.configService.getOrThrow<number>('auth.passwordMaxAgeDays'),
      ),
    };

    this.userCache.set(userId, {
      ...access,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return access;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

export function toRoleRecord(role: RoleDocument): {
  key: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
} {
  return {
    key: role.key,
    name: role.name,
    description: role.description,
    permissions: [...role.permissions],
    isSystem: role.isSystem,
  };
}
