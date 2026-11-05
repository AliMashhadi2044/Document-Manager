import { describe, expect, it, vi } from 'vitest';

import { AuditService } from './audit.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * ردپای حسابرسی.
 *
 * این آزمون از یک باگ واقعی آمد: دو مسیر — تغییر نرخ پیش‌فرض مالیات و تغییر
 * ترتیب اطلاعات پایه — شناسه‌ای رشته‌ای («invoice_defaults»، «districts») به
 * ستون UUID می‌فرستادند. در تایپ‌اسکریپت هر دو `string`اند، پس کامپایل می‌شد؛
 * در دیتابیس می‌شکست؛ و بیرون از تراکنش، خطا فقط لاگ می‌شد. نتیجه: درخواست
 * ۲۰۰ برمی‌گرداند، تنظیم عوض می‌شد، و `BASE_DATA_REORDER` در کل عمر سامانه
 * **صفر** ردیف داشت.
 *
 * پس ادعا این است: ردپا در هر حالت نوشته می‌شود، و شناسهٔ بدشکل گم نمی‌شود.
 */
function serviceWith(create: ReturnType<typeof vi.fn>): AuditService {
  return new AuditService({ auditLog: { create } } as unknown as PrismaService);
}

describe('ثبت ردپای حسابرسی', () => {
  it('شناسهٔ UUID دست‌نخورده می‌ماند', async () => {
    const create = vi.fn().mockResolvedValue({});
    const id = '4e269289-1b8c-4245-be3f-a15b5c17c147';

    await serviceWith(create).record({
      actorId: id,
      action: 'VENDOR_UPDATE',
      entityType: 'vendor',
      entityId: id,
    });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]?.[0].data;
    expect(data.entityId).toBe(id);
    expect(data.entityType).toBe('vendor');
  });

  it('شناسهٔ رشته‌ای، ردپا را حذف نمی‌کند — به entityType می‌رود', async () => {
    const create = vi.fn().mockResolvedValue({});

    await serviceWith(create).record({
      actorId: null,
      action: 'INVOICE_DEFAULTS_SET',
      entityType: 'systemSetting',
      entityId: 'invoice_defaults',
    });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]?.[0].data;
    // ستون UUID چیزی جز UUID نمی‌پذیرد؛ پس اینجا باید تهی باشد.
    expect(data.entityId).toBeNull();
    // ولی «چه چیزی عوض شد» گم نمی‌شود.
    expect(data.entityType).toBe('systemSetting.invoice_defaults');
  });

  it('داخل تراکنش، شکستِ ثبت ردپا بالا می‌رود', async () => {
    // عملیات نباید بدون ردپا تثبیت شود؛ پس خطا خورده نمی‌شود.
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    const tx = { auditLog: { create } };

    await expect(
      serviceWith(vi.fn()).record(
        { actorId: null, action: 'DOCUMENT_FINALIZE', entityType: 'document' },
        tx as never,
      ),
    ).rejects.toThrow('db down');
  });

  it('بیرون از تراکنش، شکستِ ثبت، عملیات را نمی‌اندازد', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db down'));

    await expect(
      serviceWith(create).record({ actorId: null, action: 'REPORT_RUN', entityType: 'report' }),
    ).resolves.toBeUndefined();
  });
});
