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
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { SchoolUsersService } from './school-users.service.js';
import type {
  CreateUserResult,
  GeneratedCredentials,
  SchoolUserRecord,
  SchoolUsersPage,
} from './school-users.types.js';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('school_admin')
export class SchoolUsersController {
  constructor(private readonly schoolUsersService: SchoolUsersService) {}

  @Get()
  list(
    @CurrentUser() auth: AuthIdentity,
    @Query() query: ListUsersQueryDto,
  ): Promise<SchoolUsersPage> {
    return this.schoolUsersService.list(auth, query);
  }

  @Get(':id')
  detail(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<SchoolUserRecord> {
    return this.schoolUsersService.detail(auth, id);
  }

  @Post()
  create(
    @CurrentUser() auth: AuthIdentity,
    @Body() dto: CreateUserDto,
  ): Promise<CreateUserResult> {
    return this.schoolUsersService.create(auth, dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<SchoolUserRecord> {
    return this.schoolUsersService.update(auth, id, dto);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<SchoolUserRecord> {
    return this.schoolUsersService.updateStatus(auth, id, dto.status);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<GeneratedCredentials> {
    return this.schoolUsersService.resetPassword(auth, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<void> {
    return this.schoolUsersService.remove(auth, id);
  }
}
