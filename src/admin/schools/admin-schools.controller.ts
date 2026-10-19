import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { requestMeta } from '../../auth/auth.types.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { AdminSchoolsService } from './admin-schools.service.js';
import type {
  AdminSchoolDetailResult,
  AdminSchoolSummary,
  CreateSchoolResult,
  ResendInviteResult,
  ResetPasswordSendResult,
} from './admin-schools.types.js';
import { CreateSchoolDto } from './dto/create-school.dto.js';
import { UpdateSchoolBillingDto } from './dto/update-school-billing.dto.js';
import { UpdateSchoolStatusDto } from './dto/update-school-status.dto.js';
import { UpdateSchoolDto } from './dto/update-school.dto.js';

@Controller('admin/schools')
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('super_admin')
export class AdminSchoolsController {
  constructor(private readonly adminSchoolsService: AdminSchoolsService) {}

  @Get()
  list(): Promise<AdminSchoolSummary[]> {
    return this.adminSchoolsService.list();
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<AdminSchoolDetailResult> {
    return this.adminSchoolsService.detail(id);
  }

  @Post()
  create(
    @Body() dto: CreateSchoolDto,
    @Req() request: Request,
  ): Promise<CreateSchoolResult> {
    return this.adminSchoolsService.create(dto, requestMeta(request));
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSchoolDto,
  ): Promise<AdminSchoolSummary> {
    return this.adminSchoolsService.update(id, dto);
  }

  @Patch(':id/billing')
  @HttpCode(HttpStatus.OK)
  updateBilling(
    @Param('id') id: string,
    @Body() dto: UpdateSchoolBillingDto,
  ): Promise<AdminSchoolSummary> {
    return this.adminSchoolsService.updateBilling(id, dto);
  }

  @Post(':id/resend-invite')
  @HttpCode(HttpStatus.OK)
  resendInvite(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<ResendInviteResult> {
    return this.adminSchoolsService.resendInvite(id, requestMeta(request));
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<ResetPasswordSendResult> {
    return this.adminSchoolsService.resetPassword(id, requestMeta(request));
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSchoolStatusDto,
  ): Promise<AdminSchoolSummary> {
    return this.adminSchoolsService.updateStatus(id, dto.status);
  }
}
