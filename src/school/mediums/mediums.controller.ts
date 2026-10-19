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
import { CreateMediumDto } from './dto/create-medium.dto.js';
import { ListMediumsQueryDto } from './dto/list-mediums-query.dto.js';
import { UpdateMediumDto } from './dto/update-medium.dto.js';
import { MediumsService } from './mediums.service.js';
import type { MediumRecord, MediumsPage } from './mediums.types.js';

@Controller('mediums')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MediumsController {
  constructor(private readonly mediumsService: MediumsService) {}

  @Get()
  list(
    @CurrentUser() auth: AuthIdentity,
    @Query() query: ListMediumsQueryDto,
  ): Promise<MediumsPage> {
    return this.mediumsService.list(auth, query);
  }

  @Post()
  @Roles('school_admin')
  create(
    @CurrentUser() auth: AuthIdentity,
    @Body() dto: CreateMediumDto,
  ): Promise<MediumRecord> {
    return this.mediumsService.create(auth, dto);
  }

  @Patch(':id')
  @Roles('school_admin')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateMediumDto,
  ): Promise<MediumRecord> {
    return this.mediumsService.update(auth, id, dto);
  }

  @Delete(':id')
  @Roles('school_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<void> {
    return this.mediumsService.remove(auth, id);
  }

  @Post(':id/restore')
  @Roles('school_admin')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<MediumRecord> {
    return this.mediumsService.restore(auth, id);
  }
}
