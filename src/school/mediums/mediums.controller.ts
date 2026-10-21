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
import { CreateMediumDto } from './dto/create-medium.dto.js';
import { ListMediumsQueryDto } from './dto/list-mediums-query.dto.js';
import { UpdateMediumDto } from './dto/update-medium.dto.js';
import { MediumsService } from './mediums.service.js';
import type { MediumRecord, MediumsPage } from './mediums.types.js';

@Controller('mediums')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MediumsController {
  constructor(private readonly mediumsService: MediumsService) {}

  @Get()
  @RequirePermissions('masters.view')
  list(
    @CurrentUser() auth: AuthIdentity,
    @Query() query: ListMediumsQueryDto,
  ): Promise<MediumsPage> {
    return this.mediumsService.list(auth, query);
  }

  @Post()
  @RequirePermissions('masters.manage')
  create(
    @CurrentUser() auth: AuthIdentity,
    @Body() dto: CreateMediumDto,
  ): Promise<MediumRecord> {
    return this.mediumsService.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateMediumDto,
  ): Promise<MediumRecord> {
    return this.mediumsService.update(auth, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<void> {
    return this.mediumsService.remove(auth, id);
  }

  @Post(':id/restore')
  @RequirePermissions('masters.manage')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<MediumRecord> {
    return this.mediumsService.restore(auth, id);
  }
}
