export const PERMISSION_AREAS = [
  'users',
  'roles',
  'masters',
  'questions',
  'blueprints',
  'papers',
  'reports',
  'settings',
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number];
export type Permission = `${PermissionArea}.view` | `${PermissionArea}.manage`;

export interface PermissionDefinition {
  key: Permission;
  label: string;
  description: string;
}

export interface PermissionGroup {
  area: PermissionArea;
  label: string;
  description: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_CATALOG: readonly PermissionGroup[] = [
  {
    area: 'users',
    label: 'Users',
    description: 'Staff, teacher and student accounts in your school.',
    permissions: [
      {
        key: 'users.view',
        label: 'View users',
        description: 'Browse the user directory and account details.',
      },
      {
        key: 'users.manage',
        label: 'Manage users',
        description: 'Add, edit, suspend, delete users and reset passwords.',
      },
    ],
  },
  {
    area: 'roles',
    label: 'Roles & permissions',
    description: 'Role definitions and what each role can access.',
    permissions: [
      {
        key: 'roles.view',
        label: 'View roles',
        description: 'See roles, their permissions and the audit trail.',
      },
      {
        key: 'roles.manage',
        label: 'Manage roles',
        description: 'Create, edit and delete custom roles.',
      },
    ],
  },
  {
    area: 'masters',
    label: 'Masters',
    description: 'Mediums, standards, subjects, chapters, topics and levels.',
    permissions: [
      {
        key: 'masters.view',
        label: 'View masters',
        description: 'Browse all master data used by the question bank.',
      },
      {
        key: 'masters.manage',
        label: 'Manage masters',
        description: 'Add, edit, reorder, deactivate and delete master data.',
      },
    ],
  },
  {
    area: 'questions',
    label: 'Question bank',
    description: 'Questions curated for your school.',
    permissions: [
      {
        key: 'questions.view',
        label: 'View questions',
        description: 'Browse and search the question bank.',
      },
      {
        key: 'questions.manage',
        label: 'Manage questions',
        description: 'Create, edit and delete questions.',
      },
    ],
  },
  {
    area: 'blueprints',
    label: 'Blueprints',
    description: 'Section-wise paper blueprints.',
    permissions: [
      {
        key: 'blueprints.view',
        label: 'View blueprints',
        description: 'Browse paper blueprints.',
      },
      {
        key: 'blueprints.manage',
        label: 'Manage blueprints',
        description: 'Create, edit and delete blueprints.',
      },
    ],
  },
  {
    area: 'papers',
    label: 'Papers',
    description: 'Generated question papers.',
    permissions: [
      {
        key: 'papers.view',
        label: 'View papers',
        description: 'Browse and download generated papers.',
      },
      {
        key: 'papers.manage',
        label: 'Manage papers',
        description: 'Generate, edit and delete papers.',
      },
    ],
  },
  {
    area: 'reports',
    label: 'Reports',
    description: 'Class and student insights.',
    permissions: [
      {
        key: 'reports.view',
        label: 'View reports',
        description: 'Open class and student reports.',
      },
      {
        key: 'reports.manage',
        label: 'Manage reports',
        description: 'Configure and export reporting data.',
      },
    ],
  },
  {
    area: 'settings',
    label: 'Settings',
    description: 'School profile, branding and account preferences.',
    permissions: [
      {
        key: 'settings.view',
        label: 'View settings',
        description: 'Open school settings.',
      },
      {
        key: 'settings.manage',
        label: 'Manage settings',
        description: 'Change school profile, branding and preferences.',
      },
    ],
  },
];

export const PERMISSIONS: readonly Permission[] = PERMISSION_CATALOG.flatMap(
  (group) => group.permissions.map((permission) => permission.key),
);

const PERMISSION_ORDER = new Map<Permission, number>(
  PERMISSIONS.map((permission, index) => [permission, index]),
);

export const SYSTEM_ROLE_KEYS = [
  'school_admin',
  'teacher',
  'staff',
  'student',
] as const;

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export interface SystemRoleDefinition {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: readonly Permission[];
}

const VIEW_ONLY: readonly Permission[] = PERMISSION_CATALOG.filter(
  (group) => group.area !== 'users' && group.area !== 'roles',
).map((group) => `${group.area}.view` as Permission);

export const SYSTEM_ROLE_DEFINITIONS: readonly SystemRoleDefinition[] = [
  {
    key: 'school_admin',
    name: 'School admin',
    description: 'Full access to every area of the school panel.',
    permissions: PERMISSIONS,
  },
  {
    key: 'teacher',
    name: 'Teacher',
    description:
      'Works with the question bank, blueprints and papers. Read-only elsewhere.',
    permissions: [
      ...VIEW_ONLY,
      'questions.manage',
      'blueprints.manage',
      'papers.manage',
    ],
  },
  {
    key: 'staff',
    name: 'Staff',
    description: 'Views the user directory and school data without editing.',
    permissions: [...VIEW_ONLY, 'users.view'],
  },
  {
    key: 'student',
    name: 'Student',
    description: 'Can only open their generated papers.',
    permissions: ['papers.view'],
  },
];

export function isPermission(value: string): value is Permission {
  return PERMISSION_ORDER.has(value as Permission);
}

/**
 * Keeps permissions canonical: unknown values are dropped, duplicates removed
 * and every `manage` permission implies its matching `view` permission.
 */
export function normalizePermissions(values: readonly string[]): Permission[] {
  const allowed = new Set<Permission>();

  for (const value of values) {
    if (isPermission(value)) {
      allowed.add(value);
    }
  }

  for (const value of allowed) {
    if (value.endsWith('.manage')) {
      allowed.add(value.replace(/\.manage$/, '.view') as Permission);
    }
  }

  return [...allowed].sort(
    (a, b) => (PERMISSION_ORDER.get(a) ?? 0) - (PERMISSION_ORDER.get(b) ?? 0),
  );
}

export function defaultPermissionsFor(roleKey: string): Permission[] {
  const definition = SYSTEM_ROLE_DEFINITIONS.find(
    (role) => role.key === roleKey,
  );

  return definition ? [...definition.permissions] : [];
}
