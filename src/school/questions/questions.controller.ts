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
import { CreateQuestionDto } from './dto/create-question.dto.js';
import { ListQuestionsQueryDto } from './dto/list-questions-query.dto.js';
import { UpdateQuestionDto } from './dto/update-question.dto.js';
import { QuestionsService } from './questions.service.js';
import type { QuestionRecord, QuestionsPage } from './questions.types.js';

@Controller('questions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  @RequirePermissions('questions.view')
  list(
    @CurrentUser() auth: AuthIdentity,
    @Query() query: ListQuestionsQueryDto,
  ): Promise<QuestionsPage> {
    return this.questionsService.list(auth, query);
  }

  @Get(':id')
  @RequirePermissions('questions.view')
  get(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<QuestionRecord> {
    return this.questionsService.get(auth, id);
  }

  @Post()
  @RequirePermissions('questions.manage')
  create(
    @CurrentUser() auth: AuthIdentity,
    @Body() dto: CreateQuestionDto,
  ): Promise<QuestionRecord> {
    return this.questionsService.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions('questions.manage')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
  ): Promise<QuestionRecord> {
    return this.questionsService.update(auth, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('questions.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<void> {
    return this.questionsService.remove(auth, id);
  }

  @Post(':id/restore')
  @RequirePermissions('questions.manage')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<QuestionRecord> {
    return this.questionsService.restore(auth, id);
  }
}
