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
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { AdminPlansService } from './admin-plans.service.js';
import type { AdminPlan } from './admin-plans.types.js';
import { CreatePlanDto } from './dto/create-plan.dto.js';
import { UpdatePlanDto } from './dto/update-plan.dto.js';

@Controller('admin/plans')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('super_admin')
export class AdminPlansController {
  constructor(private readonly adminPlansService: AdminPlansService) {}

  @Get()
  list(): Promise<AdminPlan[]> {
    return this.adminPlansService.list();
  }

  @Get(':code')
  detail(@Param('code') code: string): Promise<AdminPlan> {
    return this.adminPlansService.detail(code);
  }

  @Post()
  create(@Body() dto: CreatePlanDto): Promise<AdminPlan> {
    return this.adminPlansService.create(dto);
  }

  @Patch(':code')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('code') code: string,
    @Body() dto: UpdatePlanDto,
  ): Promise<AdminPlan> {
    return this.adminPlansService.update(code, dto);
  }

  @Delete(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('code') code: string): Promise<void> {
    return this.adminPlansService.remove(code);
  }
}
