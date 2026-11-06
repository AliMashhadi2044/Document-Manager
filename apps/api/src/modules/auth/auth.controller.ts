import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
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
import {
  PASSWORD_MAX_LENGTH,
  parseSessionPolicy,
  sessionPolicySchema,
  type SessionPolicy,
} from '@dm/shared';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SESSION_POLICY_KEY, SessionPolicyService } from './session-policy.service';
import type { Env } from '../../common/config/env';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'نام کاربری الزامی است').max(100),
  password: z.string().min(1, 'رمز عبور الزامی است').max(200),
});

/*
  قاعدهٔ رمز، یک‌جا در `@dm/shared` است و اینجا فقط سقف طول را می‌گذاریم.

  سقف لازم است چون بدون آن، هر درخواست می‌توانست سرور را به هش کردن مگابایت‌ها
  وادار کند؛ ولی «رمز خوب چیست» نباید دو تعریف داشته باشد.
*/
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'رمز عبور فعلی الزامی است').max(PASSWORD_MAX_LENGTH),
  newPassword: z.string().min(1, 'رمز عبور تازه الزامی است').max(PASSWORD_MAX_LENGTH),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
    private readonly policy: SessionPolicyService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
  async me(@CurrentUser() user: AuthenticatedUser): Promise<{
    id: string;
    username: string;
    fullName: string;
    roles: readonly string[];
    permissions: readonly string[];
    sessionIdleMinutes: number;
  }> {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roles: user.roles,
      permissions: user.permissions,
      /*
        مهلت بی‌تحرکی، تا رابط بتواند **پیش از** پایان نشست هشدار بدهد.

        بدون این عدد، کلاینت باید حدس می‌زد؛ و کسی که وسط فرم فاکتور است، بی‌خبر
        بیرون می‌افتاد و کارِ نیمه‌تمامش را از دست می‌داد.
      */
      sessionIdleMinutes: await this.policy.effectiveIdleMinutes(),
    };
  }

  /**
   * سیاست نشست — خواندن و نوشتن.
   *
   * مجوزش `security_settings:write` است و نه `role:write`: کوتاه یا بلند کردن
   * مهلتِ همهٔ نشست‌ها یک کنترل امنیتی است، نه بخشی از چیدن نقش‌ها.
   *
   * `effectiveIdleMinutes` هم برگردانده می‌شود تا رابط بتواند بگوید «اکنون چه
   * عددی حاکم است» — وقتی مقدار ذخیره‌نشده باشد، عددِ محیطی حاکم است.
   */
  @RequirePermission('security_settings:write')
  @Get('session-policy')
  @ApiOperation({ summary: 'خواندن سیاست نشست' })
  async readSessionPolicy(): Promise<{
    policy: SessionPolicy;
    envIdleMinutes: number;
    effectiveIdleMinutes: number;
  }> {
    const policy = await this.policy.read();
    return {
      policy,
      envIdleMinutes: this.policy.envIdleMinutes,
      effectiveIdleMinutes: policy.idleMinutes ?? this.policy.envIdleMinutes,
    };
  }

  @RequirePermission('security_settings:write')
  @Put('session-policy')
  @ApiOperation({ summary: 'ذخیرهٔ سیاست نشست' })
  async setSessionPolicy(
    @Body(new ZodBody(sessionPolicySchema)) body: SessionPolicy,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{
    policy: SessionPolicy;
    envIdleMinutes: number;
    effectiveIdleMinutes: number;
  }> {
    const before = await this.prisma.systemSetting.findUnique({
      where: { key: SESSION_POLICY_KEY },
    });

    await this.prisma.systemSetting.upsert({
      where: { key: SESSION_POLICY_KEY },
      create: { key: SESSION_POLICY_KEY, value: body, updatedBy: user.id },
      update: { value: body, updatedBy: user.id },
      select: { key: true },
    });

    // کش چند ثانیه‌ای است؛ بی‌اعتبار کردنش یعنی تغییر از همین درخواست اثر دارد.
    this.policy.invalidate();

    await this.audit.record({
      actorId: user.id,
      action: 'SESSION_POLICY_SET',
      // کلید تنظیم رشته است و `audit_logs.entity_id` ستون UUID؛ پس در entityType می‌نشیند.
      entityType: `systemSetting.${SESSION_POLICY_KEY}`,
      entityId: null,
      before: parseSessionPolicy(before?.value),
      after: body,
    });

    return {
      policy: body,
      envIdleMinutes: this.policy.envIdleMinutes,
      effectiveIdleMinutes: body.idleMinutes ?? this.policy.envIdleMinutes,
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

  /**
   * تغییر رمز توسط خودِ کاربر.
   *
   * پاسخ، کوکی نشستِ تازه را هم می‌گذارد: سرویس همهٔ نشست‌ها را می‌بندد و اگر این
   * دستگاه نشست تازه نگیرد، کاربر با عوض کردن رمز خودش را بیرون انداخته است.
   */
  @Authenticated()
  @Post('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تغییر رمز عبور کاربر جاری' })
  async changePassword(
    @Body(new ZodBody(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    const session = await this.auth.changeOwnPassword(
      user.id,
      body.currentPassword,
      body.newPassword,
      { ip: request.ip ?? null, userAgent: request.headers['user-agent'] ?? null },
    );

    this.setAuthCookies(response, session.sessionToken, session.csrfToken, session.expiresAt);
    return { ok: true };
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
