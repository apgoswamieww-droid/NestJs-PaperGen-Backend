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
import { ChaptersService } from './chapters.service.js';
import type { ChapterRecord, ChaptersPage } from './chapters.types.js';
import { CreateChapterDto } from './dto/create-chapter.dto.js';
import { ListChaptersQueryDto } from './dto/list-chapters-query.dto.js';
import { UpdateChapterDto } from './dto/update-chapter.dto.js';

@Controller('chapters')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  @Get()
  @RequirePermissions('masters.view')
  list(
    @CurrentUser() auth: AuthIdentity,
    @Query() query: ListChaptersQueryDto,
  ): Promise<ChaptersPage> {
    return this.chaptersService.list(auth, query);
  }

  @Post()
  @RequirePermissions('masters.manage')
  create(
    @CurrentUser() auth: AuthIdentity,
    @Body() dto: CreateChapterDto,
  ): Promise<ChapterRecord> {
    return this.chaptersService.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateChapterDto,
  ): Promise<ChapterRecord> {
    return this.chaptersService.update(auth, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<void> {
    return this.chaptersService.remove(auth, id);
  }

  @Post(':id/restore')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<ChapterRecord> {
    return this.chaptersService.restore(auth, id);
  }
}
