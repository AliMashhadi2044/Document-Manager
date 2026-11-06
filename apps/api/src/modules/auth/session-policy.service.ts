import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_SESSION_POLICY, parseSessionPolicy, type SessionPolicy } from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { Env } from '../../common/config/env';

/** کلید سیاست نشست در `system_settings`. */
export const SESSION_POLICY_KEY = 'session_policy';

/** مدت کشِ مقدار. */
const CACHE_TTL_MS = 15_000;

/**
 * مهلت بی‌تحرکی نشست، از دید سرور.
 *
 * این مقدار در **هر درخواست** خوانده می‌شود (در `SessionService.validate`)، پس
 * یک رفت‌وبرگشت دیتابیس به ازای هر درخواست پذیرفتنی نیست؛ مقدار برای چند ثانیه
 * کش می‌شود و نوشتنِ تنظیم، کش را بی‌اعتبار می‌کند. یعنی تغییرِ مدیر سامانه
 * بلافاصله اثر می‌کند، نه پس از راه‌اندازی دوباره.
 *
 * نبودِ تنظیم در دیتابیس یعنی «همان متغیر محیطی» — رفتار نصب‌های موجود عوض
 * نمی‌شود تا کسی آگاهانه عددی بگذارد.
 */
@Injectable()
export class SessionPolicyService {
  private cached: SessionPolicy | null = null;
  private cachedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** مقدار محیطی — سقف و مرجعِ پیش‌فرض. */
  get envIdleMinutes(): number {
    return this.config.get('SESSION_IDLE_TTL_MINUTES', { infer: true });
  }

  /** سیاست ذخیره‌شده (بدون اعمال پیش‌فرض محیطی). */
  async read(): Promise<SessionPolicy> {
    const now = Date.now();
    if (this.cached !== null && now - this.cachedAt < CACHE_TTL_MS) return this.cached;

    const row = await this.prisma.systemSetting
      .findUnique({ where: { key: SESSION_POLICY_KEY } })
      .catch(() => null);

    const policy = row === null ? DEFAULT_SESSION_POLICY : parseSessionPolicy(row.value);
    this.cached = policy;
    this.cachedAt = now;
    return policy;
  }

  /** عددی که واقعاً اعمال می‌شود: تنظیم سازمانی، وگرنه مقدار محیطی. */
  async effectiveIdleMinutes(): Promise<number> {
    const policy = await this.read();
    return policy.idleMinutes ?? this.envIdleMinutes;
  }

  /** پس از نوشتن تنظیم صدا زده می‌شود تا کش کهنه نماند. */
  invalidate(): void {
    this.cached = null;
    this.cachedAt = 0;
  }
}
