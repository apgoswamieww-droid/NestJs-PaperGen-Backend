import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthIdentity } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { ListRoleAuditQueryDto } from './dto/list-role-audit-query.dto.js';
import { ListRolesQueryDto } from './dto/list-roles-query.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { RolesService } from './roles.service.js';
import type {
  RoleAuditPage,
  RoleOption,
  RoleRecord,
  RolesPage,
} from './roles.types.js';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('roles.view')
  list(
    @CurrentUser() auth: AuthIdentity,
    @Query() query: ListRolesQueryDto,
  ): Promise<RolesPage> {
    return this.rolesService.list(auth, query);
  }

  @Get('options')
  @RequirePermissions('users.view')
  options(@CurrentUser() auth: AuthIdentity): Promise<RoleOption[]> {
    return this.rolesService.options(auth);
  }

  @Get('audit')
  @RequirePermissions('roles.view')
  audit(
    @CurrentUser() auth: AuthIdentity,
    @Query() query: ListRoleAuditQueryDto,
  ): Promise<RoleAuditPage> {
    return this.rolesService.audit(auth, query);
  }

  @Post()
  @RequirePermissions('roles.manage')
  create(
    @CurrentUser() auth: AuthIdentity,
    @Body() dto: CreateRoleDto,
  ): Promise<RoleRecord> {
    return this.rolesService.create(auth, dto);
  }

  @Patch(':key')
  @RequirePermissions('roles.manage')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() auth: AuthIdentity,
    @Param('key') key: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleRecord> {
    return this.rolesService.update(auth, key, dto);
  }

  @Delete(':key')
  @RequirePermissions('roles.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() auth: AuthIdentity,
    @Param('key') key: string,
  ): Promise<void> {
    return this.rolesService.remove(auth, key);
  }
}
