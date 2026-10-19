import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AuthService,
  FORGOT_PASSWORD_MESSAGE,
} from '../../auth/auth.service.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from '../../auth/auth-cookie.js';
import {
  requestMeta,
  type AuthIdentity,
  type SessionResponse,
  type SessionUser,
} from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { ForgotPasswordDto } from '../../auth/dto/forgot-password.dto.js';
import { LoginDto } from '../../auth/dto/login.dto.js';
import { ResetPasswordDto } from '../../auth/dto/reset-password.dto.js';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard.js';
import { OriginCheckGuard } from '../../auth/guards/origin-check.guard.js';

@Controller('admin/auth')
@UseGuards(OriginCheckGuard, ThrottlerGuard)
export class AdminAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const result = await this.authService.login(
      'admin',
      dto,
      requestMeta(request),
    );

    setRefreshCookie(
      response,
      'admin',
      result.refresh.token,
      result.refresh.expiresAt,
      this.configService,
    );

    return result.session;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const rawToken = readRefreshCookie(request, 'admin');

    try {
      const result = await this.authService.refresh(
        'admin',
        rawToken,
        requestMeta(request),
      );

      setRefreshCookie(
        response,
        'admin',
        result.refresh.token,
        result.refresh.expiresAt,
        this.configService,
      );

      return result.session;
    } catch (error) {
      clearRefreshCookie(response, 'admin', this.configService);
      throw error;
    }
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword('admin', dto, requestMeta(request));

    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.authService.resetPassword('admin', dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout('admin', readRefreshCookie(request, 'admin'));
    clearRefreshCookie(response, 'admin', this.configService);
  }

  @Get('me')
  @UseGuards(AdminJwtGuard)
  me(@CurrentUser() identity: AuthIdentity): Promise<SessionUser> {
    return this.authService.me('admin', identity.id);
  }
}
