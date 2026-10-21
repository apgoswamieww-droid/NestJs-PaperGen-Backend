import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../permissions.js';

export const PERMISSIONS_KEY = 'auth:permissions';

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
