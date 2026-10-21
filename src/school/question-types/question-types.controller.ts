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
import { CreateQuestionTypeDto } from './dto/create-question-type.dto.js';
import { ListQuestionTypesQueryDto } from './dto/list-question-types-query.dto.js';
import { UpdateQuestionTypeDto } from './dto/update-question-type.dto.js';
import { QuestionTypesService } from './question-types.service.js';
import type {
  QuestionTypeRecord,
  QuestionTypesPage,
} from './question-types.types.js';

@Controller('question-types')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QuestionTypesController {
  constructor(private readonly questionTypesService: QuestionTypesService) {}

  @Get()
  @RequirePermissions('masters.view')
  list(
    @CurrentUser() auth: AuthIdentity,
    @Query() query: ListQuestionTypesQueryDto,
  ): Promise<QuestionTypesPage> {
    return this.questionTypesService.list(auth, query);
  }

  @Post()
  @RequirePermissions('masters.manage')
  create(
    @CurrentUser() auth: AuthIdentity,
    @Body() dto: CreateQuestionTypeDto,
  ): Promise<QuestionTypeRecord> {
    return this.questionTypesService.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateQuestionTypeDto,
  ): Promise<QuestionTypeRecord> {
    return this.questionTypesService.update(auth, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<void> {
    return this.questionTypesService.remove(auth, id);
  }

  @Post(':id/restore')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<QuestionTypeRecord> {
    return this.questionTypesService.restore(auth, id);
  }
}
