import type { PermissionGroup, Permission } from '../../auth/permissions.js';
import type { RoleAuditAction } from '../../schemas/role-audit.schema.js';

export interface RoleRecord {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RolesSummary {
  total: number;
  system: number;
  custom: number;
  assignedUsers: number;
}

export interface RolesPage {
  items: RoleRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: RolesSummary;
  catalog: PermissionGroup[];
}

export interface RoleOption {
  key: string;
  name: string;
  isSystem: boolean;
}

export interface RoleAuditSnapshot {
  name: string;
  description: string;
  permissions: string[];
}

export interface RoleAuditRecord {
  id: string;
  roleKey: string;
  roleName: string;
  action: RoleAuditAction;
  actorName: string;
  actorEmail: string;
  before: RoleAuditSnapshot | null;
  after: RoleAuditSnapshot | null;
  createdAt: string;
}

export interface RoleAuditPage {
  items: RoleAuditRecord[];
  total: number;
  page: number;
  pageSize: number;
}
