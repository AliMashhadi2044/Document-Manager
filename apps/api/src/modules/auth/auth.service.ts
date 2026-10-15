import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import type { Env } from '../../common/config/env';
import { SessionService, type IssuedSession } from './session.service';

export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGIN_LOCKED'
  | 'LOGOUT'
  | 'LOGOUT_ALL';

export interface LoginContext {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * ورود.
   *
   * قواعد امنیتی:
   *  - پیام خطا برای «کاربر ناموجود» و «رمز اشتباه» **یکسان** است تا نام کاربری لو نرود.
   *  - شمارش تلاش ناموفق و قفل زمانی حساب.
   *  - هر نتیجه در `security_events` ثبت می‌شود.
   */
  async login(username: string, password: string, context: LoginContext): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { username } });

    if (!user || !user.isActive) {
      // هش ساختگی تا زمان پاسخ، وجود یا نبود کاربر را لو ندهد.
      await argon2.hash('timing-equalizer').catch(() => undefined);
      await this.recordEvent('LOGIN_FAILED', null, username, context);
      throw AppError.unauthorized('نام کاربری یا رمز عبور نادرست است');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.recordEvent('LOGIN_LOCKED', user.id, username, context);
      throw AppError.tooManyRequests(
        'به دلیل تلاش‌های ناموفق، حساب شما موقتاً قفل شده است. بعداً تلاش کنید.',
      );
    }

    const valid = await argon2.verify(user.passwordHash, password).catch(() => false);

    if (!valid) {
      await this.registerFailedAttempt(user.id, user.failedLoginCount);
      await this.recordEvent('LOGIN_FAILED', user.id, username, context);
      throw AppError.unauthorized('نام کاربری یا رمز عبور نادرست است');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await this.recordEvent('LOGIN_SUCCESS', user.id, username, context);
    return this.sessions.issue(user.id, context.ip, context.userAgent);
  }

  async logout(sessionToken: string, userId: string | null, context: LoginContext): Promise<void> {
    await this.sessions.revokeByToken(sessionToken);
    await this.recordEvent('LOGOUT', userId, null, context);
  }

  async logoutEverywhere(userId: string, context: LoginContext): Promise<number> {
    const count = await this.sessions.revokeAllForUser(userId);
    await this.recordEvent('LOGOUT_ALL', userId, null, context);
    return count;
  }

  private async registerFailedAttempt(userId: string, current: number): Promise<void> {
    const maxAttempts = this.config.get('LOGIN_MAX_ATTEMPTS', { infer: true });
    const lockMinutes = this.config.get('LOGIN_LOCK_MINUTES', { infer: true });
    const next = current + 1;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: next,
        lockedUntil: next >= maxAttempts ? new Date(Date.now() + lockMinutes * 60_000) : null,
      },
    });
  }

  private async recordEvent(
    type: SecurityEventType,
    userId: string | null,
    username: string | null,
    context: LoginContext,
  ): Promise<void> {
    try {
      await this.prisma.securityEvent.create({
        data: {
          type,
          userId,
          username,
          ip: context.ip,
          userAgent: context.userAgent?.slice(0, 500) ?? null,
        },
      });
    } catch (error) {
      // ثبت رویداد امنیتی نباید مسیر اصلی را بشکند، ولی باید دیده شود.
      this.logger.error({ err: error, type }, 'ثبت رویداد امنیتی ناموفق بود');
    }
  }

  static hashPassword(password: string): Promise<string> {
    // پارامترهای توصیه‌شده OWASP برای Argon2id.
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }
}
