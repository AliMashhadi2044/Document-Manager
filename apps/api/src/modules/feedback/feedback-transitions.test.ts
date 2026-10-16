import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, type Permission } from '@dm/shared';

import { FEEDBACK_TRANSITIONS } from './feedback.service';

/**
 * تفکیک وظایف در **گذارهای وضعیت بازخورد**.
 *
 * چرا این تست جدا از `role-separation.test.ts` است: آن تست سطح مسیر HTTP را می‌پاید و
 * مسیر تغییر وضعیت با `@RequireAnyPermission` برای هر دو نقش باز است. تفکیک واقعی یک
 * لایه پایین‌تر است — در جدول گذارها — و اگر کسی فردا `feedback:reopen` را به
 * کارپردازی بدهد یا گذار `RESOLVED → OPEN` را زیر `feedback:resolve` ببرد، تنها همین
 * تست قرمز می‌شود.
 *
 * نقصی که این تست از آن محافظت می‌کند، در آزمون زنده فاز ۵ پیدا شد: شمارنده بازخورد
 * باز، دروازه نهایی شدن بایگانی است؛ پس اگر بستن بازخورد تنها در دست کارپردازی باشد،
 * ایرادِ ناظر را همان کسی می‌بندد که ایراد به کار او گرفته شده است.
 */

const PROCUREMENT = DEFAULT_ROLE_PERMISSIONS.PROCUREMENT;
const SUPERVISOR = DEFAULT_ROLE_PERMISSIONS.SUPERVISOR;
const ARCHIVIST = DEFAULT_ROLE_PERMISSIONS.ARCHIVIST;

function permissionFor(from: keyof typeof FEEDBACK_TRANSITIONS, to: string): Permission | undefined {
  return FEEDBACK_TRANSITIONS[from].find((item) => item.to === to)?.permission;
}

describe('گذارهای وضعیت بازخورد و تفکیک وظایف', () => {
  it('بستن بازخورد کار کارپردازی است، نه ناظر', () => {
    for (const from of ['OPEN', 'ANSWERED'] as const) {
      for (const to of ['RESOLVED', 'REJECTED'] as const) {
        const permission = permissionFor(from, to);
        expect(permission, `گذار ${from} → ${to} تعریف نشده است`).toBe('feedback:resolve');
      }
    }

    expect(PROCUREMENT).toContain('feedback:resolve');
    expect(SUPERVISOR).not.toContain('feedback:resolve');
  });

  it('بازگشایی بازخورد کار ناظر است، نه کارپردازی', () => {
    expect(permissionFor('ANSWERED', 'OPEN')).toBe('feedback:reopen');
    expect(permissionFor('RESOLVED', 'OPEN')).toBe('feedback:reopen');
    expect(permissionFor('REJECTED', 'OPEN')).toBe('feedback:reopen');

    expect(SUPERVISOR).toContain('feedback:reopen');
    expect(PROCUREMENT).not.toContain('feedback:reopen');
  });

  it('هیچ نقشی هم‌زمان بستن و بازگشایی را ندارد', () => {
    // قلب ماجرا: اگر یک نقش هر دو را داشته باشد، دروازه بایگانی را خودش باز می‌کند.
    for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const bothHeld =
        permissions.includes('feedback:resolve') && permissions.includes('feedback:reopen');
      expect(bothHeld, `نقش ${role} هم بستن و هم بازگشایی را دارد`).toBe(false);
    }
  });

  it('بایگانی هیچ گذار بازخوردی را نمی‌تواند', () => {
    const archivistCan = Object.values(FEEDBACK_TRANSITIONS)
      .flat()
      .filter((item) => ARCHIVIST.includes(item.permission));

    expect(archivistCan).toEqual([]);
  });

  it('هیچ وضعیتی بن‌بست نیست — هر وضعیت دست‌کم یک راه خروج دارد', () => {
    // گردش کار مستند (docs/07 §۷) وعده می‌دهد که بازخورد بسته‌شده قابل بازگشایی است؛
    // اگر کسی `RESOLVED: []` را برگرداند، آن وعده بی‌پشتوانه می‌شود.
    for (const [status, transitions] of Object.entries(FEEDBACK_TRANSITIONS)) {
      expect(transitions.length, `وضعیت ${status} هیچ گذار خروجی ندارد`).toBeGreaterThan(0);
    }
  });

  it('هر گذار مجوزی دارد که دست‌کم یک نقش پیش‌فرض آن را دارد', () => {
    const orphans: string[] = [];

    for (const [status, transitions] of Object.entries(FEEDBACK_TRANSITIONS)) {
      for (const transition of transitions) {
        const holders = Object.values(DEFAULT_ROLE_PERMISSIONS).filter((permissions) =>
          permissions.includes(transition.permission),
        );
        if (holders.length === 0) {
          orphans.push(`${status} → ${transition.to} (${transition.permission})`);
        }
      }
    }

    expect(orphans, 'این گذارها برای هیچ نقشی شدنی نیستند').toEqual([]);
  });
});
