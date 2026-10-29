import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { StadReportLinesService, defaultNotes, defaultQuantity, unitAmountOf } from './stad-report-lines.service';

/**
 * پیش‌فرض‌های ردیف «گزارش مالی سامانه ستاد».
 *
 * اینجا دو چیز سنجیده می‌شود و هر دو مستقیماً همان‌اند که روی فرم کاغذی دیده
 * می‌شوند: جملهٔ شمارشِ قلم‌ها، و تعدادی که مبلغ واحد از آن حساب می‌شود.
 */

/** یک قلم فاکتور — فقط مقدارش برای این حساب‌ها لازم است. */
const qty = (value: string) => ({ quantity: new Prisma.Decimal(value) });

describe('پیش‌فرض‌های ردیف گزارش ستاد', () => {
  it('جملهٔ توضیحات، تعداد قلم‌ها و جمعشان را می‌گوید', () => {
    expect(defaultNotes([qty('2'), qty('25'), qty('1')])).toBe(
      'تعداد 3 قلم کالا مجموعا 28 عدد',
    );
  });

  it('فاکتور بی‌قلم، توضیح ساختگی نمی‌سازد', () => {
    expect(defaultNotes([])).toBe('');
  });

  /*
    فاکتور تک‌قلمی تعداد همان قلم را می‌گیرد — ۶۹ عدد ام‌دی‌اف یعنی تعدادِ ۶۹ —
    ولی فاکتور چندقلمی عددِ واحدی ندارد و ۱ می‌گیرد؛ شرحش در توضیحات می‌نشیند.
  */
  it('تعداد از قلم یکتا می‌آید و برای چند قلم ۱ است', () => {
    expect(defaultQuantity([qty('69')])).toBe(69);
    expect(defaultQuantity([qty('2'), qty('25')])).toBe(1);
    expect(defaultQuantity([])).toBe(1);
  });

  /** تعدادِ صفر یا کسری نباید مبلغ واحد را بی‌معنا کند. */
  it('تعداد کمتر از یک به ۱ می‌افتد', () => {
    expect(defaultQuantity([qty('0')])).toBe(1);
    expect(defaultQuantity([qty('0.4')])).toBe(1);
  });

  it('مبلغ واحد، مبلغ کل بدون ارزش افزوده تقسیم بر تعداد است', () => {
    expect(unitAmountOf(10_281_000_000n, 69)).toBe(149_000_000n);
    expect(unitAmountOf(31_143_000_000n, 1)).toBe(31_143_000_000n);
    // تقسیم بر صفر رخ نمی‌دهد: تعداد نامعتبر به ۱ می‌افتد.
    expect(unitAmountOf(100n, 0)).toBe(100n);
  });
});

/** ساخت سرویس با یک تراکنش ساختگی که فقط upsert را ضبط می‌کند. */
function serviceWithRecorder() {
  const upserts: Record<string, unknown>[] = [];
  const deletes: unknown[] = [];

  const tx = {
    invoiceStadReportLine: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async (args: { create: Record<string, unknown> }) => {
        upserts.push(args.create);
        return args.create;
      }),
      deleteMany: vi.fn(async (args: unknown) => {
        deletes.push(args);
        return { count: 0 };
      }),
    },
  };

  const service = new StadReportLinesService(
    {} as never,
    { record: vi.fn() } as never,
    { assertDocumentVisible: vi.fn() } as never,
  );

  return { service, tx, upserts, deletes };
}

const INVOICE = {
  id: 'inv-1',
  description: 'کولر گازی مدارس',
  netAmount: 31_143_000_000n,
  totalAmount: 34_257_300_000n,
  items: [qty('10'), qty('20'), qty('8'), qty('1')],
};

describe('هماهنگی ردیف با فاکتور', () => {
  it('ردیف تازه با پیش‌فرض‌های فاکتور ساخته می‌شود', async () => {
    const { service, tx, upserts } = serviceWithRecorder();

    await service.sync(tx as never, 'STAD', INVOICE);

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      itemTitle: 'کولر گازی مدارس',
      quantity: 1,
      cashAmount: 34_257_300_000n,
      notes: 'تعداد 4 قلم کالا مجموعا 39 عدد',
      editedFields: [],
    });
  });

  /*
    سند عادی در این گزارش نیست.

    حذف عمدی است و نه نادیده گرفتن: فاکتوری که از ستاد به عادی تغییر نوع می‌دهد،
    نباید ردیفی در گزارش ستاد جا بگذارد.
  */
  it('سند غیرستادی ردیف نمی‌گیرد و ردیف قبلی‌اش پاک می‌شود', async () => {
    const { service, tx, upserts, deletes } = serviceWithRecorder();

    await service.sync(tx as never, 'NORMAL', INVOICE);

    expect(upserts).toEqual([]);
    expect(deletes).toEqual([{ where: { invoiceId: 'inv-1' } }]);
  });

  /** آنچه کاربر دستی نوشته با ویرایش فاکتور پاک نمی‌شود؛ بقیه بازحساب می‌شوند. */
  it('فیلد دستی‌شده بازحساب نمی‌شود', async () => {
    const { service, tx, upserts } = serviceWithRecorder();

    tx.invoiceStadReportLine.findUnique = vi.fn(async () => ({
      editedFields: ['itemTitle', 'quantity'],
      itemTitle: 'عنوان دستی',
      quantity: 7,
      cashAmount: 1n,
      notes: 'یادداشت قدیمی',
    })) as never;

    await service.sync(tx as never, 'STAD', INVOICE);

    expect(upserts[0]).toMatchObject({
      itemTitle: 'عنوان دستی',
      quantity: 7,
      // مبلغ نقدی و توضیحات دستی نشده‌اند، پس از فاکتور تازه می‌آیند.
      cashAmount: 34_257_300_000n,
      notes: 'تعداد 4 قلم کالا مجموعا 39 عدد',
      // مبلغ واحد همیشه مشتق است: ۳۱٬۱۴۳٬۰۰۰٬۰۰۰ ÷ ۷
      unitAmount: 31_143_000_000n / 7n,
    });
  });
});
