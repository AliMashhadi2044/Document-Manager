import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { AuthService } from './auth.service';
import { CSRF_COOKIE, SESSION_COOKIE, SessionService } from './session.service';
import {
  Authenticated,
  CurrentUser,
  Public,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import type { Env } from '../../common/config/env';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'نام کاربری الزامی است').max(100),
  password: z.string().min(1, 'رمز عبور الزامی است').max(200),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ورود به سامانه' })
  async login(
    @Body(new ZodBody(loginSchema)) body: z.infer<typeof loginSchema>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    const context = {
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    };

    const session = await this.auth.login(body.username, body.password, context);
    this.setAuthCookies(response, session.sessionToken, session.csrfToken, session.expiresAt);
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'خروج از سامانه' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[SESSION_COOKIE];

    if (token) {
      const user = await this.sessions.validate(token);
      await this.auth.logout(token, user?.id ?? null, {
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
    }

    this.clearAuthCookies(response);
    return { ok: true };
  }

  @RequirePermission()
  @Get('me')
  @ApiOperation({ summary: 'اطلاعات کاربر جاری و مجوزهای او' })
  me(@CurrentUser() user: AuthenticatedUser): {
    id: string;
    username: string;
    fullName: string;
    roles: readonly string[];
    permissions: readonly string[];
  } {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roles: user.roles,
      permissions: user.permissions,
    };
  }

  @Authenticated()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'خروج از همه دستگاه‌ها' })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ revoked: number }> {
    const revoked = await this.auth.logoutEverywhere(user.id, {
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });
    this.clearAuthCookies(response);
    return { revoked };
  }

  private setAuthCookies(
    response: Response,
    sessionToken: string,
    csrfToken: string,
    expiresAt: Date,
  ): void {
    const secure = this.config.get('NODE_ENV', { infer: true }) === 'production';

    // کوکی نشست: خارج از دسترس JavaScript، پس XSS موضعی هم هویت را نمی‌دزدد.
    response.cookie(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    // کوکی CSRF باید توسط کلاینت خوانده شود تا در هدر بازگردد.
    response.cookie(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      secure,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }

  private clearAuthCookies(response: Response): void {
    response.clearCookie(SESSION_COOKIE, { path: '/' });
    response.clearCookie(CSRF_COOKIE, { path: '/' });
  }
}
