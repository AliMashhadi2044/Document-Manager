import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_PREFERENCES,
  normalizeSelectPrefs,
  parsePreferences,
  type UserPreferences,
} from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * ترجیح‌های شخصی‌سازی کاربر جاری.
 *
 * شناسهٔ کاربر **همیشه** از نشست می‌آید و هیچ متدی آن را از ورودی نمی‌گیرد؛ پس
 * مسیری برای خواندن یا نوشتن ترجیح کاربر دیگری وجود ندارد (IDOR از اساس ممکن
 * نیست، نه اینکه بعد بررسی شود).
 *
 * در حسابرسی ثبت نمی‌شود: اینجا تم و رنگ و پینِ یک فهرست است، نه داده یا دسترسی.
 * ردیف حسابرسی برای هر بار عوض کردن رنگ، فقط ردپای واقعی را زیر انبوه نویز گم
 * می‌کرد.
 */
@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<UserPreferences> {
    const row = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: { theme: true, primaryColor: true, lastSection: true, selectPrefs: true },
    });

    // کاربری که هنوز چیزی عوض نکرده ردیفی ندارد؛ این حالت عادی است، نه خطا.
    if (!row) return DEFAULT_PREFERENCES;

    return parsePreferences({
      theme: row.theme,
      primaryColor: row.primaryColor,
      lastSection: row.lastSection,
      select: row.selectPrefs ?? {},
    });
  }

  /**
   * جایگزینی کل سند ترجیح.
   *
   * کلاینت همیشه سند کامل را می‌فرستد، پس نوشتنِ جزئی و حالت‌های نیمه‌ذخیره‌شده
   * وجود ندارد. `upsert` لازم است چون ردیف پروفایل تا نخستین تغییر ساخته نشده.
   */
  async replace(userId: string, input: UserPreferences): Promise<UserPreferences> {
    // ترجیح خالیِ یک فهرست، ردیفی در پروفایل لازم ندارد.
    const select: Record<string, UserPreferences['select'][string]> = {};
    for (const [key, prefs] of Object.entries(input.select)) {
      const normalized = normalizeSelectPrefs(prefs);
      if (normalized) select[key] = normalized;
    }

    const data = {
      theme: input.theme,
      primaryColor: input.primaryColor,
      lastSection: input.lastSection,
      // `select` فقط رشته و آرایهٔ رشته دارد؛ Prisma نوع JSON ورودی را نمی‌تواند از
      // یک نوع ساختاری استنتاج کند.
      selectPrefs: select as unknown as Prisma.InputJsonObject,
    };

    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    return { ...input, select };
  }
}
