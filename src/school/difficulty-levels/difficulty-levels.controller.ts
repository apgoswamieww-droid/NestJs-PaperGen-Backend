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
import { DifficultyLevelsService } from './difficulty-levels.service.js';
import type {
  DifficultyLevelRecord,
  DifficultyLevelsPage,
} from './difficulty-levels.types.js';
import { CreateDifficultyLevelDto } from './dto/create-difficulty-level.dto.js';
import { ListDifficultyLevelsQueryDto } from './dto/list-difficulty-levels-query.dto.js';
import { UpdateDifficultyLevelDto } from './dto/update-difficulty-level.dto.js';

@Controller('difficulty-levels')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DifficultyLevelsController {
  constructor(
    private readonly difficultyLevelsService: DifficultyLevelsService,
  ) {}

  @Get()
  @RequirePermissions('masters.view')
  list(
    @CurrentUser() auth: AuthIdentity,
    @Query() query: ListDifficultyLevelsQueryDto,
  ): Promise<DifficultyLevelsPage> {
    return this.difficultyLevelsService.list(auth, query);
  }

  @Post()
  @RequirePermissions('masters.manage')
  create(
    @CurrentUser() auth: AuthIdentity,
    @Body() dto: CreateDifficultyLevelDto,
  ): Promise<DifficultyLevelRecord> {
    return this.difficultyLevelsService.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateDifficultyLevelDto,
  ): Promise<DifficultyLevelRecord> {
    return this.difficultyLevelsService.update(auth, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<void> {
    return this.difficultyLevelsService.remove(auth, id);
  }

  @Post(':id/restore')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<DifficultyLevelRecord> {
    return this.difficultyLevelsService.restore(auth, id);
  }
}
