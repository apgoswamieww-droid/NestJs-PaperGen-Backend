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
import { CreateExamTypeDto } from './dto/create-exam-type.dto.js';
import { ListExamTypesQueryDto } from './dto/list-exam-types-query.dto.js';
import { UpdateExamTypeDto } from './dto/update-exam-type.dto.js';
import { ExamTypesService } from './exam-types.service.js';
import type { ExamTypeRecord, ExamTypesPage } from './exam-types.types.js';

@Controller('exam-types')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExamTypesController {
  constructor(private readonly examTypesService: ExamTypesService) {}

  @Get()
  @RequirePermissions('masters.view')
  list(
    @CurrentUser() auth: AuthIdentity,
    @Query() query: ListExamTypesQueryDto,
  ): Promise<ExamTypesPage> {
    return this.examTypesService.list(auth, query);
  }

  @Post()
  @RequirePermissions('masters.manage')
  create(
    @CurrentUser() auth: AuthIdentity,
    @Body() dto: CreateExamTypeDto,
  ): Promise<ExamTypeRecord> {
    return this.examTypesService.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateExamTypeDto,
  ): Promise<ExamTypeRecord> {
    return this.examTypesService.update(auth, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<void> {
    return this.examTypesService.remove(auth, id);
  }

  @Post(':id/restore')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<ExamTypeRecord> {
    return this.examTypesService.restore(auth, id);
  }
}
