import { describe, expect, it, vi } from 'vitest';

import { AttachmentsService } from './attachments.service';

/**
 * کلید موقتِ رکورد PENDING.
 *
 * نقصی که این آزمون می‌بندد: کلید موقت رشتهٔ **خالی** بود و ستونش قید یکتایی
 * دارد. یعنی تنها **یک** رکورد PENDING می‌توانست هم‌زمان وجود داشته باشد؛ اولین
 * آپلودی که نیمه‌کاره می‌ماند جای آن رشته را می‌گرفت و از آن پس هر آپلودی در کل
 * سامانه با خطای یکتایی رد می‌شد — با پیام «آپلود این فایل ناموفق بود» که هیچ
 * نمی‌گوید و در log هم ردی نداشت.
 *
 * ادعا ساده است: دو آپلود پشت‌سرهم، دو کلید موقتِ **متفاوت** می‌سازند.
 */

/** کمترین چیزی که `upload` لازم دارد تا به ساختِ رکورد PENDING برسد. */
function serviceWithRecordingPrisma() {
  const created: Record<string, unknown>[] = [];

  const prisma = {
    attachment: {
      // سند خالی: نه سقف تعداد پر است و نه فایل تکراری دارد.
      aggregate: vi.fn(async () => ({ _count: { _all: 0 }, _sum: { sizeBytes: 0n } })),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        // بعد از ساخت رکورد، مسیر به ذخیره‌سازی می‌رسد که اینجا شکست می‌خورد.
        return { id: `a-${created.length}` };
      }),
    },
  };

  const storage = {
    buildDocumentKey: (documentId: string, id: string) => `documents/${documentId}/${id}.pdf`,
    put: vi.fn(async () => {
      throw new Error('فضای ذخیره‌سازی در دسترس نیست');
    }),
  };

  const service = new AttachmentsService(
    prisma as never,
    { record: vi.fn() } as never,
    storage as never,
    {
      assertDocumentVisible: vi.fn(async () => ({ status: 'DRAFT' })),
    } as never,
  );

  return { service, created };
}

const FILE = {
  originalname: 'scan.pdf',
  mimetype: 'application/pdf',
  size: 13,
  buffer: Buffer.from('%PDF-1.4 test'),
};

const USER = {
  id: 'u1',
  username: 'karpardaz',
  fullName: 'کارپرداز',
  roles: [],
  permissions: [],
  sessionId: 's1',
};

describe('کلید موقت پیوست', () => {
  it('دو آپلود، دو کلید موقت متفاوت می‌سازند', async () => {
    const { service, created } = serviceWithRecordingPrisma();

    // آپلود در ذخیره‌سازی شکست می‌خورد؛ آنچه مهم است، رکوردی است که پیش از آن ساخته شد.
    await expect(service.upload('d-1', FILE, 'SCAN', USER as never)).rejects.toThrow();
    await expect(service.upload('d-2', FILE, 'SCAN', USER as never)).rejects.toThrow();

    const keys = created.map((data) => data.storageKey as string);
    expect(keys).toHaveLength(2);
    expect(keys[0], 'کلید موقت خالی است و با رکورد بعدی برخورد می‌کند').not.toBe('');
    expect(keys[0]).not.toBe(keys[1]);
    for (const key of keys) expect(key.startsWith('pending:')).toBe(true);
  });
});
