import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Permission } from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import type { Env } from '../../common/config/env';
import { SessionPolicyService } from './session-policy.service';

export const SESSION_COOKIE = 'dm_session';
export const CSRF_COOKIE = 'dm_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export interface IssuedSession {
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly expiresAt: Date;
}

/**
 * نشست سروری (ADR-0004).
 *
 * فقط **هش** توکن ذخیره می‌شود، پس افشای دیتابیس به سرقت نشست منجر نمی‌شود.
 * ابطال فوری ممکن است — چیزی که با JWT بی‌حالت به‌دست نمی‌آید.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly policy: SessionPolicyService,
  ) {}

  /** ساخت نشست تازه. شناسه نشست پس از ورود بازتولید می‌شود (ضد session fixation). */
  async issue(userId: string, ip: string | null, userAgent: string | null): Promise<IssuedSession> {
    const sessionToken = randomBytes(48).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.get('SESSION_ABSOLUTE_TTL_MINUTES', { infer: true }) * 60_000,
    );

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(sessionToken),
        csrfTokenHash: hashToken(csrfToken),
        ip,
        userAgent: userAgent?.slice(0, 500) ?? null,
        expiresAt,
      },
    });

    return { sessionToken, csrfToken, expiresAt };
  }

  /**
   * اعتبارسنجی نشست و بارگذاری مجوزهای کاربر.
   *
   * دو انقضا بررسی می‌شود: انقضای مطلق و انقضای بی‌تحرکی. نشست باطل‌شده یا کاربر
   * غیرفعال، هر دو رد می‌شوند — یعنی غیرفعال کردن کاربر اثر **فوری** دارد.
   */
  async validate(sessionToken: string): Promise<AuthenticatedUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(sessionToken) },
      include: {
        user: {
          include: {
            roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
          },
        },
      },
    });

    if (!session || session.revokedAt !== null) return null;

    const now = Date.now();
    if (session.expiresAt.getTime() <= now) return null;

    /*
      مهلت بی‌تحرکی از تنظیم سازمانی می‌آید و نه فقط از متغیر محیطی؛ مدیر سامانه
      می‌تواند عوضش کند و اثرش بر همین مسیر است — همان جایی که نشست باطل می‌شود.
    */
    const idleLimit = (await this.policy.effectiveIdleMinutes()) * 60_000;
    if (now - session.lastSeenAt.getTime() > idleLimit) {
      await this.revokeById(session.id);
      return null;
    }

    if (!session.user.isActive) {
      await this.revokeById(session.id);
      return null;
    }

    // تمدید پنجره بی‌تحرکی. نوشتن در هر درخواست لازم نیست؛ فقط وقتی معنادار است.
    if (now - session.lastSeenAt.getTime() > 60_000) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      });
    }

    const permissions = new Set<string>();
    const roles: string[] = [];
    for (const userRole of session.user.roles) {
      roles.push(userRole.role.key);
      for (const rolePermission of userRole.role.permissions) {
        permissions.add(rolePermission.permission.key);
      }
    }

    return {
      id: session.user.id,
      username: session.user.username,
      fullName: session.user.fullName,
      roles,
      permissions: [...permissions] as Permission[],
      sessionId: session.id,
    };
  }

  /** بررسی توکن CSRF در برابر مقدار گره‌خورده به همان نشست. */
  async matchesCsrf(sessionId: string, csrfToken: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { csrfTokenHash: true },
    });
    if (!session) return false;
    return safeEqual(session.csrfTokenHash, hashToken(csrfToken));
  }

  async revokeByToken(sessionToken: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(sessionToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeById(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** خروج از همه دستگاه‌ها. */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
