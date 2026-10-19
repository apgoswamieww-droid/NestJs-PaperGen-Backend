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
import { CreateStandardDto } from './dto/create-standard.dto.js';
import { ListStandardsQueryDto } from './dto/list-standards-query.dto.js';
import { UpdateStandardDto } from './dto/update-standard.dto.js';
import { StandardsService } from './standards.service.js';
import type { StandardRecord, StandardsPage } from './standards.types.js';

@Controller('standards')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StandardsController {
  constructor(private readonly standardsService: StandardsService) {}

  @Get()
  list(
    @CurrentUser() auth: AuthIdentity,
    @Query() query: ListStandardsQueryDto,
  ): Promise<StandardsPage> {
    return this.standardsService.list(auth, query);
  }

  @Post()
  @Roles('school_admin')
  create(
    @CurrentUser() auth: AuthIdentity,
    @Body() dto: CreateStandardDto,
  ): Promise<StandardRecord> {
    return this.standardsService.create(auth, dto);
  }

  @Patch(':id')
  @Roles('school_admin')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
    @Body() dto: UpdateStandardDto,
  ): Promise<StandardRecord> {
    return this.standardsService.update(auth, id, dto);
  }

  @Delete(':id')
  @Roles('school_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<void> {
    return this.standardsService.remove(auth, id);
  }

  @Post(':id/restore')
  @Roles('school_admin')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() auth: AuthIdentity,
    @Param('id') id: string,
  ): Promise<StandardRecord> {
    return this.standardsService.restore(auth, id);
  }
}
