import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { AuthIdentity } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ImportStudentsDto } from './dto/import-students.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { SchoolUsersService } from './school-users.service.js';
import { StudentImportService } from './student-import.service.js';
import type {
  CreateUserResult,
  GeneratedCredentials,
  SchoolUserRecord,
  SchoolUsersPage,
  StudentImportResult,
} from './school-users.types.js';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SchoolUsersController {
  constructor(
    private readonly schoolUsersService: SchoolUsersService,
    private readonly studentImportService: StudentImportService,
  ) {}

  @Get()
  @RequirePermissions('users.view')
  list(
    @CurrentUser() auth: AuthIdentity,
    @Query() query: ListUsersQueryDto,
  ): Promise<SchoolUsersPage> {
    return this.schoolUsersService.list(auth, query);
  }

  @Get('import-template')
  @RequirePermissions('users.manage')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header(
    'Content-Disposition',
    'attachment; filename="student-import-template.xlsx"',
  )
  async importTemplate(
    @CurrentUser() auth: AuthIdentity,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.studentImportService.template(auth));
  }

  @Get(':id')
  @RequirePermissions('users.view')
  detail(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<SchoolUserRecord> {
    return this.schoolUsersService.detail(auth, id);
  }

  @Post('import')
  @RequirePermissions('users.manage')
  @HttpCode(HttpStatus.OK)
  importStudents(
    @CurrentUser() auth: AuthIdentity,
    @Body() dto: ImportStudentsDto,
  ): Promise<StudentImportResult> {
    return this.studentImportService.importStudents(auth, dto);
  }

  @Post()
  @RequirePermissions('users.manage')
  create(
    @CurrentUser() auth: AuthIdentity,
    @Body() dto: CreateUserDto,
  ): Promise<CreateUserResult> {
    return this.schoolUsersService.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions('users.manage')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<SchoolUserRecord> {
    return this.schoolUsersService.update(auth, id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('users.manage')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<SchoolUserRecord> {
    return this.schoolUsersService.updateStatus(auth, id, dto.status);
  }

  @Post(':id/reset-password')
  @RequirePermissions('users.manage')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<GeneratedCredentials> {
    return this.schoolUsersService.resetPassword(auth, id);
  }

  @Delete(':id')
  @RequirePermissions('users.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<void> {
    return this.schoolUsersService.remove(auth, id);
  }
}
