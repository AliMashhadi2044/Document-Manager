import { describe, expect, it } from 'vitest';
import type { FilterGroup, Permission } from '@dm/shared';

import { AppError } from '../../common/errors/app-error';
import { DocumentAccessService } from '../documents/document-access.service';
import { AnalyticsService } from './analytics.service';
import { DATASET_BY_KEY } from './datasets';
import { buildOrderBy, buildWhere, nest } from './filter.builder';
import { buildSelect, flatten } from './analytics.service';

/**
 * دروازه‌های فیلتر گزارش‌گیری عمومی.
 *
 * این تست‌ها روی **مرز امنیتی** کار می‌کنند، نه روی راحتی: فیلتر از مرورگر می‌آید و
 * هر چیزی که از این تابع رد شود، به کوئری می‌رسد. پس هر دروازه تست خودش را دارد —
 * فیلد ناشناخته، فیلد بی‌مجوز، عملگر بی‌معنا، مقدار بی‌معنا و سقف‌ها.
 */

const DOCUMENTS = DATASET_BY_KEY.get('documents')!;
const INVOICES = DATASET_BY_KEY.get('invoices')!;

const ALL: readonly Permission[] = [
  'document:read',
  'document:read_draft',
  'invoice:read_calc_details',
  'report:run',
  'report:export',
];

/** بایگانی: مجوز دیدن سند دارد، ولی جزئیات محاسبه فاکتور را ندارد. */
const ARCHIVIST: readonly Permission[] = ['document:read', 'archive:write', 'report:run'];

function group(conditions: FilterGroup['conditions'], combine: 'and' | 'or' = 'and'): FilterGroup {
  return { combine, conditions };
}

describe('ساخت شرط فیلتر', () => {
  it('کلید عمومی به مسیر داخلی نگاشته می‌شود، نه مستقیم به ستون', () => {
    const where = buildWhere(
      DOCUMENTS,
      group([{ field: 'buyerName', op: 'contains', values: ['ناحیه'] }]),
      ALL,
    );

    // کلید `buyerName` است ولی مسیر `buyerSnapshot.name`.
    expect(where).toEqual({
      buyerSnapshot: { name: { contains: 'ناحیه', mode: 'insensitive' } },
    });
  });

  it('فیلد ناشناخته رد می‌شود', () => {
    expect(() =>
      buildWhere(DOCUMENTS, group([{ field: 'passwordHash', op: 'eq', values: ['x'] }]), ALL),
    ).toThrow(AppError);
  });

  it('فیلد غیرقابل‌فیلتر رد می‌شود', () => {
    expect(() =>
      buildWhere(
        DOCUMENTS,
        group([{ field: 'id', op: 'eq', values: ['00000000-0000-0000-0000-000000000000'] }]),
        ALL,
      ),
    ).toThrow(/نمی‌شود فیلتر گذاشت/u);
  });

  /**
   * فیلتر روی ستونی که کاربر حق دیدنش را ندارد، خودش یک کانال استنتاج است: با
   * فیلترهای پی‌درپی روی مبلغی که دیده نمی‌شود، می‌شد مقدارش را حدس زد. پس ۴۰۳
   * می‌دهد، نه «نتیجه خالی».
   */
  it('فیلتر روی فیلد بی‌مجوز ۴۰۳ می‌دهد', () => {
    expect(() =>
      buildWhere(INVOICES, group([{ field: 'taxAmount', op: 'gt', values: ['0'] }]), ARCHIVIST),
    ).toThrow(/در اختیار نقش شما نیست/u);

    // و همان فیلتر برای کاربری که مجوزش را دارد کار می‌کند.
    expect(
      buildWhere(INVOICES, group([{ field: 'taxAmount', op: 'gt', values: ['0'] }]), ALL),
    ).toEqual({ taxAmount: { gt: 0n } });
  });

  it('عملگر بی‌معنا برای نوع فیلد رد می‌شود', () => {
    expect(() =>
      buildWhere(DOCUMENTS, group([{ field: 'totalAmount', op: 'contains', values: ['۱۲'] }]), ALL),
    ).toThrow(/نمی‌خواند/u);
  });

  it('مبلغ به bigint تبدیل می‌شود و عدد بزرگ سالم می‌ماند', () => {
    const big = '9007199254740993'; // 2^53 + 1
    const where = buildWhere(
      DOCUMENTS,
      group([{ field: 'totalAmount', op: 'gte', values: [big] }]),
      ALL,
    );
    expect(where).toEqual({ totalAmount: { gte: BigInt(big) } });
  });

  it('مقدار غیرعددی برای مبلغ رد می‌شود', () => {
    expect(() =>
      buildWhere(DOCUMENTS, group([{ field: 'totalAmount', op: 'eq', values: ['۱۲۳'] }]), ALL),
    ).toThrow(/عدد صحیح/u);
  });

  it('تاریخ نامعتبر رد می‌شود', () => {
    expect(() =>
      buildWhere(DOCUMENTS, group([{ field: 'documentDate', op: 'gte', values: ['فردا'] }]), ALL),
    ).toThrow(/تاریخ معتبری نیست/u);
  });

  it('عملگر بین، دو مقدار می‌خواهد', () => {
    expect(() =>
      buildWhere(DOCUMENTS, group([{ field: 'fiscalYear', op: 'between', values: ['1405'] }]), ALL),
    ).toThrow(/دو مقدار/u);

    expect(
      buildWhere(
        DOCUMENTS,
        group([{ field: 'fiscalYear', op: 'between', values: ['1404', '1405'] }]),
        ALL,
      ),
    ).toEqual({ fiscalYear: { gte: 1404, lte: 1405 } });
  });

  it('عملگر بدون مقدار، مقدار نمی‌پذیرد', () => {
    expect(() =>
      buildWhere(DOCUMENTS, group([{ field: 'documentNumber', op: 'isEmpty', values: ['x'] }]), ALL),
    ).toThrow(/مقدار نمی‌گیرد/u);

    expect(
      buildWhere(DOCUMENTS, group([{ field: 'documentNumber', op: 'isEmpty', values: [] }]), ALL),
    ).toEqual({ documentNumber: null });
  });

  it('گروه «یا» با OR و گروه «و» با AND ساخته می‌شود', () => {
    const orWhere = buildWhere(
      DOCUMENTS,
      group(
        [
          { field: 'status', op: 'eq', values: ['ARCHIVED'] },
          { field: 'status', op: 'eq', values: ['FINALIZED'] },
        ],
        'or',
      ),
      ALL,
    );
    expect(orWhere).toEqual({ OR: [{ status: 'ARCHIVED' }, { status: 'FINALIZED' }] });

    const andWhere = buildWhere(
      DOCUMENTS,
      group([
        { field: 'fiscalYear', op: 'eq', values: ['1405'] },
        { field: 'type', op: 'eq', values: ['NORMAL'] },
      ]),
      ALL,
    );
    expect(andWhere).toEqual({ AND: [{ fiscalYear: 1405 }, { type: 'NORMAL' }] });
  });

  it('گروه تودرتو ساخته می‌شود', () => {
    const where = buildWhere(
      DOCUMENTS,
      {
        combine: 'and',
        conditions: [{ field: 'fiscalYear', op: 'eq', values: ['1405'] }],
        groups: [
          {
            combine: 'or',
            conditions: [
              { field: 'status', op: 'eq', values: ['ARCHIVED'] },
              { field: 'status', op: 'eq', values: ['FINALIZED'] },
            ],
          },
        ],
      },
      ALL,
    );

    expect(where).toEqual({
      AND: [{ fiscalYear: 1405 }, { OR: [{ status: 'ARCHIVED' }, { status: 'FINALIZED' }] }],
    });
  });

  it('سقف تعداد شرط و عمق اعمال می‌شود', () => {
    const many = Array.from({ length: 41 }, () => ({
      field: 'fiscalYear',
      op: 'eq' as const,
      values: ['1405'],
    }));
    expect(() => buildWhere(DOCUMENTS, group(many), ALL)).toThrow(/تعداد شرط‌های فیلتر/u);

    const deep: FilterGroup = {
      combine: 'and',
      conditions: [],
      groups: [
        { combine: 'and', conditions: [], groups: [{ combine: 'and', conditions: [], groups: [{ combine: 'and', conditions: [] }] }] },
      ],
    };
    expect(() => buildWhere(DOCUMENTS, deep, ALL)).toThrow(/عمق گروه‌های فیلتر/u);
  });

  it('فیلتر خالی شرط خالی می‌دهد، نه شرط همیشه-درست ساختگی', () => {
    expect(buildWhere(DOCUMENTS, group([]), ALL)).toEqual({});
  });
});

describe('ترتیب مرتب‌سازی', () => {
  it('فیلد ناشناخته رد می‌شود', () => {
    expect(() => buildOrderBy(DOCUMENTS, [{ field: 'secret', dir: 'asc' }], ALL)).toThrow(AppError);
  });

  /** ترتیب ردیف‌ها مقدار ستون را لو می‌دهد، حتی اگر ستون در خروجی نباشد. */
  it('مرتب‌سازی روی فیلد بی‌مجوز رد می‌شود', () => {
    expect(() => buildOrderBy(INVOICES, [{ field: 'netAmount', dir: 'desc' }], ARCHIVIST)).toThrow(
      /در اختیار نقش شما نیست/u,
    );
  });

  it('ترتیب ثانویه پایدار همیشه اضافه می‌شود', () => {
    const order = buildOrderBy(DOCUMENTS, [{ field: 'totalAmount', dir: 'desc' }], ALL);
    expect(order).toEqual([{ totalAmount: 'desc' }, { id: 'asc' }]);
  });

  it('بدون مرتب‌سازی درخواستی، پیش‌فرض مجموعه‌داده استفاده می‌شود', () => {
    expect(buildOrderBy(DOCUMENTS, [], ALL)).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
  });
});

describe('دامنه دسترسی سند در گزارش‌ها', () => {
  const service = new AnalyticsService(null as never, new DocumentAccessService(null as never));

  const archivist = {
    id: 'u1',
    username: 'bayegan',
    fullName: 'بایگان',
    roles: ['ARCHIVIST'],
    permissions: ARCHIVIST,
    sessionId: 's1',
  };

  it('دامنه دسترسی بیرونی‌ترین لایه است و فیلتر کاربر بازش نمی‌کند', () => {
    const where = service.whereFor(
      DOCUMENTS,
      { filter: group([{ field: 'status', op: 'eq', values: ['DRAFT'] }]) },
      archivist,
    );

    /*
      کاربر پیش‌نویس خواسته، ولی دامنه نقشش فقط سه وضعیت را می‌دهد؛ هر دو شرط با
      AND ترکیب می‌شوند و نتیجه‌اش «هیچ» است — نه «پیش‌نویس‌ها».

      `deletedAt: null` هم همیشه در لایهٔ بیرونی هست: سندِ در سطل زباله از هیچ
      گزارشی بیرون نمی‌آید، و چون شرط اینجاست، فیلتر کاربر نمی‌تواند بازش کند.
    */
    expect(where).toEqual({
      AND: [
        {
          deletedAt: null,
          status: { in: ['PENDING_ARCHIVE', 'ARCHIVED', 'NEEDS_REVISION'] },
        },
        { status: 'DRAFT' },
      ],
    });
  });

  it('روی مجموعه‌داده‌های وابسته، دامنه زیر مسیر سند می‌نشیند', () => {
    const where = service.whereFor(INVOICES, { filter: group([]) }, archivist);
    expect(where).toEqual({
      document: {
        deletedAt: null,
        status: { in: ['PENDING_ARCHIVE', 'ARCHIVED', 'NEEDS_REVISION'] },
      },
    });
  });

  /*
    شرط ثابتِ گزارش انشعابات باید در **هر** کوئری باشد و نه فقط در جدول؛ اگر فیلتر
    کاربر بتواند جایش را بگیرد، همان گزارش با یک کلیک قبض سوخت هم نشان می‌دهد.
  */
  it('شرط ثابت مجموعه‌داده با فیلتر کاربر هم می‌ماند', () => {
    const utilities = DATASET_BY_KEY.get('utilities') as never;
    const where = service.whereFor(
      utilities,
      { filter: group([{ field: 'districtTitle', op: 'eq', values: ['ناحیه ۱'] }]) },
      { ...archivist, permissions: ALL },
    );

    expect(where).toEqual({
      AND: [
        {
          document: {
            deletedAt: null,
          },
        },
        { invoiceKind: 'UTILITY' },
        { utilityDetail: { districtTitleSnapshot: 'ناحیه ۱' } },
      ],
    });
  });

  it('مجموعه‌داده بدون مجوز ۴۰۴ می‌گیرد، نه ۴۰۳', () => {
    try {
      service.requireDataset('activity', archivist);
      expect.unreachable('باید خطا می‌داد');
    } catch (error) {
      expect((error as AppError).status).toBe(404);
    }
  });

  it('ستون بی‌مجوز در فهرست ستون‌های خواسته‌شده رد می‌شود', () => {
    expect(() => service.resolveColumns(INVOICES, ['netAmount'], ARCHIVIST)).toThrow(
      /در اختیار نقش شما نیست/u,
    );
  });
});

describe('پروجکشن و تخت‌کردن نتیجه', () => {
  it('فقط ستون‌های خواسته‌شده از دیتابیس خوانده می‌شوند', () => {
    const columns = new AnalyticsService(
      null as never,
      new DocumentAccessService(null as never),
    ).resolveColumns(DOCUMENTS, ['title', 'buyerName', 'totalAmount'], ALL);

    expect(buildSelect(columns)).toEqual({
      title: true,
      buyerSnapshot: { select: { name: true } },
      totalAmount: true,
    });
  });

  it('شمارش رابطه با _count خوانده می‌شود، نه با کوئری به‌ازای هر ردیف', () => {
    const vendors = DATASET_BY_KEY.get('vendors')!;
    const columns = new AnalyticsService(
      null as never,
      new DocumentAccessService(null as never),
    ).resolveColumns(vendors, ['name', 'invoiceCount'], ALL);

    /*
      شمارش هم شرط خودش را دارد: `_count` بیرون از `where` کوئری است و دامنهٔ سند
      به آن نمی‌رسد، پس بدون این شرط «تعداد فاکتور» فروشنده، فاکتورهای سندهای در
      سطل زباله را هم می‌شمرد.
    */
    expect(buildSelect(columns)).toEqual({
      name: true,
      _count: { select: { invoices: { where: { document: { deletedAt: null } } } } },
    });
  });

  it('مبلغ به رشته و تاریخ به ISO تبدیل می‌شود', () => {
    const columns = new AnalyticsService(
      null as never,
      new DocumentAccessService(null as never),
    ).resolveColumns(DOCUMENTS, ['totalAmount', 'createdAt', 'buyerName'], ALL);

    const row = flatten(
      {
        totalAmount: 9_007_199_254_740_993n,
        createdAt: new Date('2026-10-16T08:00:00.000Z'),
        buyerSnapshot: { name: 'ناحیه آزمون' },
      },
      columns,
    );

    expect(row).toEqual({
      totalAmount: '9007199254740993',
      createdAt: '2026-10-16T08:00:00.000Z',
      buyerName: 'ناحیه آزمون',
    });
  });

  it('مسیر غایب به null تبدیل می‌شود، نه خطا', () => {
    const columns = new AnalyticsService(
      null as never,
      new DocumentAccessService(null as never),
    ).resolveColumns(DOCUMENTS, ['buyerName'], ALL);

    expect(flatten({ buyerSnapshot: null }, columns)).toEqual({ buyerName: null });
  });
});

describe('ابزار مسیر', () => {
  it('مسیر نقطه‌دار به شیء تودرتو تبدیل می‌شود', () => {
    expect(nest('a.b.c', 1)).toEqual({ a: { b: { c: 1 } } });
    expect(nest('a', 1)).toEqual({ a: 1 });
  });
});

/*
  مرتب‌سازی روی شمارش رابطه.

  `{ _count: { invoices: 'asc' } }` شکلِ `select` است و نه `orderBy`؛ پریزما
  دومی را `{ invoices: { _count: 'asc' } }` می‌خواهد و با اولی ۵۰۰ می‌داد.
*/
describe('مرتب‌سازی روی تعداد رابطه', () => {
  it('شمارش رابطه شکل خودش را می‌گیرد', () => {
    const vendors = DATASET_BY_KEY.get('vendors')!;
    const order = buildOrderBy(vendors, [{ field: 'invoiceCount', dir: 'desc' }], ALL);

    expect(order[0]).toEqual({ invoices: { _count: 'desc' } });
  });
});

/**
 * فیلدهای یک‌به‌چند — «شرح ردیف‌ها».
 *
 * «شرح فاکتور» اختیاری است و اغلب خالی می‌ماند؛ چیزی که کاربر واقعاً نوشته، شرح
 * تک‌تک ردیف‌هاست. ستونی که معمولاً خالی است، جست‌وجویی می‌سازد که کار نمی‌کند.
 */
describe('فیلد یک‌به‌چند', () => {
  it('فیلتر به «دست‌کم یکی از ردیف‌ها» تبدیل می‌شود', () => {
    const where = buildWhere(
      INVOICES,
      group([{ field: 'itemDescriptions', op: 'contains', values: ['کاغذ'] }]),
      ALL,
    );

    expect(where).toEqual({
      items: { some: { description: { contains: 'کاغذ', mode: 'insensitive' } } },
    });
  });

  /*
    بدون `some`، Prisma شرط را نمی‌شناخت و کوئری می‌شکست — نه اینکه نتیجهٔ خالی
    بدهد. پس ادعا دربارهٔ **نبودِ** شکل تودرتوی ساده هم هست.
  */
  it('شرط ساده‌ی تودرتو نمی‌سازد', () => {
    const where = buildWhere(
      INVOICES,
      group([{ field: 'itemDescriptions', op: 'contains', values: ['کاغذ'] }]),
      ALL,
    );
    expect(where).not.toEqual({ items: { description: { contains: 'کاغذ', mode: 'insensitive' } } });
  });

  /*
    پرش دوپله: سند ← فاکتورها ← ردیف‌ها.

    هر دو پله باید `some` بگیرند. نسخهٔ اول نشان پلهٔ دوم را موقع بریدن مسیر پاک
    می‌کرد و شرطی می‌ساخت که پریزما نمی‌شناخت — ۵۰۰ روی گزارش اسناد.
  */
  it('دو پرش پشت سر هم، دو `some` می‌سازند', () => {
    const where = buildWhere(
      DOCUMENTS,
      group([{ field: 'itemDescriptions', op: 'contains', values: ['کاغذ'] }]),
      ALL,
    );

    expect(where).toEqual({
      invoices: {
        some: { items: { some: { description: { contains: 'کاغذ', mode: 'insensitive' } } } },
      },
    });
  });

  // «خالی است» روی یک رابطهٔ یک‌به‌چند دو معنای متفاوت دارد؛ هر دو بسته‌اند.
  it('عملگر «خالی است» روی آن پذیرفته نمی‌شود', () => {
    expect(() =>
      buildWhere(INVOICES, group([{ field: 'itemDescriptions', op: 'isEmpty', values: [] }]), ALL),
    ).toThrow(AppError);
  });

  it('مرتب‌سازی روی آن پذیرفته نمی‌شود', () => {
    expect(() =>
      buildOrderBy(INVOICES, [{ field: 'itemDescriptions', dir: 'asc' }], ALL),
    ).toThrow(AppError);
  });

  it('ستونش همهٔ شرح‌ها را در یک سلول کنار هم می‌گذارد', () => {
    const column = INVOICES.fields.find((field) => field.key === 'itemDescriptions')!;

    expect(buildSelect([column])).toEqual({ items: { select: { description: true } } });

    const row = {
      items: [{ description: 'کاغذ A4' }, { description: 'خودکار' }, { description: '' }],
    };
    // ردیفِ بی‌شرح جداکنندهٔ اضافه نمی‌سازد.
    expect(flatten(row, [column])).toEqual({ itemDescriptions: 'کاغذ A4، خودکار' });
  });

  it('فاکتور بدون ردیف، سلول خالی می‌دهد و نه خطا', () => {
    const column = INVOICES.fields.find((field) => field.key === 'itemDescriptions')!;
    expect(flatten({ items: [] }, [column])).toEqual({ itemDescriptions: null });
  });
});

/**
 * جزئیات اختصاصی فاکتور در فهرست فیلترها.
 *
 * فاکتور انشعابات مدرسه دارد و فاکتور سوخت پلاک؛ بدون این فیلدها، کاربری که روی
 * «نوع فاکتور: انشعابات» فیلتر گذاشته هیچ راهی نداشت بگوید «کدام مدرسه».
 */
describe('فیلدهای انشعابات و سوخت', () => {
  it('مدرسه از snapshot خوانده می‌شود، نه از رکورد امروز', () => {
    const where = buildWhere(
      INVOICES,
      group([{ field: 'schoolTitle', op: 'contains', values: ['سرای ایرانی'] }]),
      ALL,
    );

    expect(where).toEqual({
      utilityDetail: { schoolTitleSnapshot: { contains: 'سرای ایرانی', mode: 'insensitive' } },
    });
  });

  it('پلاک خودرو هم فیلترشدنی است', () => {
    const where = buildWhere(
      INVOICES,
      group([{ field: 'vehiclePlate', op: 'contains', values: ['۱۲'] }]),
      ALL,
    );

    expect(where).toEqual({
      fuelDetail: { plateNumberSnapshot: { contains: '۱۲', mode: 'insensitive' } },
    });
  });
});
