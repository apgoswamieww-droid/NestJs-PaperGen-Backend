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
import { CreateTopicDto } from './dto/create-topic.dto.js';
import { ListTopicsQueryDto } from './dto/list-topics-query.dto.js';
import { UpdateTopicDto } from './dto/update-topic.dto.js';
import { TopicsService } from './topics.service.js';
import type { TopicRecord, TopicsPage } from './topics.types.js';

@Controller('topics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Get()
  @RequirePermissions('masters.view')
  list(
    @CurrentUser() auth: AuthIdentity,
    @Query() query: ListTopicsQueryDto,
  ): Promise<TopicsPage> {
    return this.topicsService.list(auth, query);
  }

  @Post()
  @RequirePermissions('masters.manage')
  create(
    @CurrentUser() auth: AuthIdentity,
    @Body() dto: CreateTopicDto,
  ): Promise<TopicRecord> {
    return this.topicsService.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateTopicDto,
  ): Promise<TopicRecord> {
    return this.topicsService.update(auth, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<void> {
    return this.topicsService.remove(auth, id);
  }

  @Post(':id/restore')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<TopicRecord> {
    return this.topicsService.restore(auth, id);
  }
}
