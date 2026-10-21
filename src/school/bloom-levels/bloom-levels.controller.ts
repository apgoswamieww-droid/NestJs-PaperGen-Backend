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
import { BloomLevelsService } from './bloom-levels.service.js';
import type {
  BloomLevelRecord,
  BloomLevelsPage,
} from './bloom-levels.types.js';
import { CreateBloomLevelDto } from './dto/create-bloom-level.dto.js';
import { ListBloomLevelsQueryDto } from './dto/list-bloom-levels-query.dto.js';
import { UpdateBloomLevelDto } from './dto/update-bloom-level.dto.js';

@Controller('bloom-levels')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BloomLevelsController {
  constructor(private readonly bloomLevelsService: BloomLevelsService) {}

  @Get()
  @RequirePermissions('masters.view')
  list(
    @CurrentUser() auth: AuthIdentity,
    @Query() query: ListBloomLevelsQueryDto,
  ): Promise<BloomLevelsPage> {
    return this.bloomLevelsService.list(auth, query);
  }

  @Post()
  @RequirePermissions('masters.manage')
  create(
    @CurrentUser() auth: AuthIdentity,
    @Body() dto: CreateBloomLevelDto,
  ): Promise<BloomLevelRecord> {
    return this.bloomLevelsService.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateBloomLevelDto,
  ): Promise<BloomLevelRecord> {
    return this.bloomLevelsService.update(auth, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<void> {
    return this.bloomLevelsService.remove(auth, id);
  }

  @Post(':id/restore')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<BloomLevelRecord> {
    return this.bloomLevelsService.restore(auth, id);
  }
}
