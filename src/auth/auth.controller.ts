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
import { AuthService, FORGOT_PASSWORD_MESSAGE } from './auth.service.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './auth-cookie.js';
import {
  requestMeta,
  type AuthIdentity,
  type SessionResponse,
  type SessionUser,
} from './auth.types.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { OriginCheckGuard } from './guards/origin-check.guard.js';

@Controller('auth')
@UseGuards(OriginCheckGuard, ThrottlerGuard)
export class AuthController {
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
      'app',
      dto,
      requestMeta(request),
    );

    setRefreshCookie(
      response,
      'app',
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
    const rawToken = readRefreshCookie(request, 'app');

    try {
      const result = await this.authService.refresh(
        'app',
        rawToken,
        requestMeta(request),
      );

      setRefreshCookie(
        response,
        'app',
        result.refresh.token,
        result.refresh.expiresAt,
        this.configService,
      );

      return result.session;
    } catch (error) {
      clearRefreshCookie(response, 'app', this.configService);
      throw error;
    }
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword('app', dto, requestMeta(request));

    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.authService.resetPassword('app', dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout('app', readRefreshCookie(request, 'app'));
    clearRefreshCookie(response, 'app', this.configService);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() identity: AuthIdentity): Promise<SessionUser> {
    return this.authService.me('app', identity.id);
  }
}
