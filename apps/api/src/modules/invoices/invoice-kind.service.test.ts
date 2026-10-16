import { describe, expect, it, vi } from 'vitest';
import { INVOICE_KINDS, type InvoiceKind } from '@dm/shared';

import { AppError } from '../../common/errors/app-error';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { InvoiceKindService } from './invoice-kind.service';
import type { InvoiceDetailsBody } from './invoice.schema';

/**
 * معیارهای پذیرش فاز ۴ که اینجا اثبات می‌شوند:
 *
 *  ۱. انتخاب فرم از روی **خانواده نوع فاکتور** انجام می‌شود، نه عنوان فصل.
 *  ۴. روز ناموجود در ماه شمسی رد می‌شود.
 *  ۵. انشعابات از همان مسیر ردیف‌های مالی فاکتور عادی می‌گذرد.
 */

const ACTIVE_SCHOOL = {
  id: 'school-1',
  title: 'دبستان نمونه',
  districtId: 'district-9',
  isActive: true,
  district: { id: 'district-9', title: 'ناحیه چهار', isActive: true },
};

const ACTIVE_VEHICLE = {
  id: 'vehicle-1',
  plateNumber: '۱۲ ب ۳۴۵ ایران ۶۷',
  vehicleTypeId: 'vtype-3',
  isActive: true,
  vehicleType: { id: 'vtype-3', title: 'سواری', isActive: true },
};

function makeService(overrides: Record<string, unknown> = {}): InvoiceKindService {
  const prisma = {
    school: { findUnique: vi.fn(async () => ACTIVE_SCHOOL) },
    utilityType: {
      findUnique: vi.fn(async () => ({ id: 'utility-1', title: 'آب', isActive: true })),
    },
    vehicle: { findUnique: vi.fn(async () => ACTIVE_VEHICLE) },
    fuelType: {
      findUnique: vi.fn(async () => ({ id: 'fuel-1', title: 'بنزین', isActive: true })),
    },
    ...overrides,
  };

  return new InvoiceKindService(prisma as unknown as PrismaService);
}

const utilityDetails: InvoiceDetailsBody = {
  kind: 'UTILITY',
  schoolId: 'school-1',
  utilityTypeId: 'utility-1',
  baseAmount: '12500000',
  discountAmount: '0',
  taxMode: 'PERCENT',
  taxRateBp: 1000,
  taxAmount: null,
};

const fuelDetails: InvoiceDetailsBody = {
  kind: 'FUEL',
  vehicleId: 'vehicle-1',
  fuelTypeId: 'fuel-1',
  jalaliYear: 1405,
  jalaliMonth: 7,
  entries: [
    { day: 12, amount: '800000' },
    { day: 3, amount: '500000' },
  ],
};

describe('انتخاب مسیر بر اساس خانواده فاکتور', () => {
  it('هر خانواده‌ای در enum یک مسیر آماده‌سازی دارد (هیچ‌کدام جا نمانده)', async () => {
    const service = makeService();
    const sample: Record<InvoiceKind, InvoiceDetailsBody> = {
      NORMAL: {
        kind: 'NORMAL',
        taxMode: 'PERCENT',
        taxRateBp: 1000,
        taxAmount: null,
        items: [
          {
            rowNo: 1,
            description: 'کاغذ A4',
            productCode: null,
            quantity: '2',
            unitId: null,
            unitPrice: '1000000',
            discountAmount: '0',
            taxMode: 'PERCENT',
            taxRateBp: 1000,
            taxAmount: null,
          },
        ],
      },
      STAD: {
        kind: 'STAD',
        taxMode: 'AMOUNT',
        taxRateBp: null,
        taxAmount: '5000',
        items: [
          {
            rowNo: 1,
            description: 'خدمت',
            productCode: null,
            quantity: '1',
            unitId: null,
            unitPrice: '50000',
            discountAmount: '0',
            taxMode: 'AMOUNT',
            taxRateBp: null,
            taxAmount: '5000',
          },
        ],
      },
      UTILITY: utilityDetails,
      FUEL: fuelDetails,
    };

    for (const kind of INVOICE_KINDS) {
      const prepared = await service.prepare(kind, sample[kind]);
      expect(prepared.items.length, `خانواده ${kind}`).toBeGreaterThan(0);
    }
  });

  it('اگر فرم ارسالی با خانواده نوع فاکتور نخواند، رد می‌شود', async () => {
    const service = makeService();

    // کلاینت ادعا می‌کند فرم انشعابات پر شده، ولی نوع فاکتور در دیتابیس «سوخت» است.
    await expect(service.prepare('FUEL', utilityDetails)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });

    await expect(service.prepare('NORMAL', fuelDetails)).rejects.toBeInstanceOf(AppError);
  });
});

describe('آماده‌سازی فاکتور انشعابات', () => {
  it('یک ردیف مالی با شرح ساخته‌شده از همان داده‌های snapshot می‌سازد', async () => {
    const prepared = await makeService().prepare('UTILITY', utilityDetails);

    expect(prepared.items).toHaveLength(1);
    expect(prepared.items[0]).toMatchObject({
      rowNo: 1,
      description: 'آب — دبستان نمونه',
      quantity: '1',
      unitPrice: '12500000',
      taxMode: 'PERCENT',
      taxRateBp: 1000,
    });
    // مالیات فاکتور همان مالیات ردیف است؛ مسیر محاسبه با فاکتور عادی یکی می‌ماند.
    expect(prepared.invoiceTax).toEqual({ mode: 'PERCENT', rateBp: 1000, amount: null });
  });

  it('ناحیه از رکورد مدرسه نوشته می‌شود، نه از ورودی کلاینت', async () => {
    const prepared = await makeService().prepare('UTILITY', utilityDetails);

    const create = vi.fn(async (_args: { data: Record<string, unknown> }) => ({}));
    await prepared.writeDetails(
      { invoiceUtilityDetail: { create } } as never,
      { id: 'invoice-1', items: [{ id: 'item-1', rowNo: 1 }] },
    );

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        invoiceId: 'invoice-1',
        invoiceKind: 'UTILITY',
        districtId: 'district-9',
        districtTitleSnapshot: 'ناحیه چهار',
        schoolTitleSnapshot: 'دبستان نمونه',
        utilityTypeTitleSnapshot: 'آب',
      },
    });
  });

  it('مدرسه غیرفعال، ناحیه غیرفعال و نوع انشعاب غیرفعال رد می‌شوند', async () => {
    const inactiveSchool = makeService({
      school: { findUnique: vi.fn(async () => ({ ...ACTIVE_SCHOOL, isActive: false })) },
    });
    await expect(inactiveSchool.prepare('UTILITY', utilityDetails)).rejects.toThrowError(
      /مدرسه/,
    );

    const inactiveDistrict = makeService({
      school: {
        findUnique: vi.fn(async () => ({
          ...ACTIVE_SCHOOL,
          district: { ...ACTIVE_SCHOOL.district, isActive: false },
        })),
      },
    });
    await expect(inactiveDistrict.prepare('UTILITY', utilityDetails)).rejects.toThrowError(
      /ناحیه/,
    );

    const inactiveUtility = makeService({
      utilityType: { findUnique: vi.fn(async () => ({ id: 'u', title: 'آب', isActive: false })) },
    });
    await expect(inactiveUtility.prepare('UTILITY', utilityDetails)).rejects.toThrowError(
      /نوع انشعاب/,
    );
  });
});

describe('آماده‌سازی فاکتور سوخت', () => {
  it('هر روز یک ردیف مالی می‌شود، مرتب‌شده بر اساس روز، بدون مالیات', async () => {
    const prepared = await makeService().prepare('FUEL', fuelDetails);

    expect(prepared.items.map((item) => item.rowNo)).toEqual([1, 2]);
    // ورودی ۱۲ و ۳ بود؛ خروجی باید ۳ و ۱۲ باشد.
    expect(prepared.items.map((item) => item.unitPrice)).toEqual(['500000', '800000']);
    expect(prepared.items.map((item) => item.description)).toEqual([
      'سوخت‌گیری 1405/07/03',
      'سوخت‌گیری 1405/07/12',
    ]);

    // تصمیم Q10: مالیات سوخت صفر است، در ردیف و در فاکتور.
    expect(prepared.items.every((item) => item.taxAmount === '0')).toBe(true);
    expect(prepared.items.every((item) => item.taxRateBp === null)).toBe(true);
    expect(prepared.invoiceTax).toEqual({ mode: 'AMOUNT', rateBp: null, amount: '0' });
  });

  it('روز ۳۱ در مهر رد می‌شود و مسیر خطا به همان ردیف اشاره می‌کند', async () => {
    const service = makeService();

    try {
      await service.prepare('FUEL', {
        ...fuelDetails,
        entries: [{ day: 31, amount: '100000' }],
      } as InvoiceDetailsBody);
      expect.unreachable('باید خطا می‌داد');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const details = (error as AppError).details ?? [];
      expect(details[0]?.path).toBe('details.entries.0.day');
    }
  });

  it('روز ۳۰ اسفند در سال غیرکبیسه رد و در سال کبیسه پذیرفته می‌شود', async () => {
    const service = makeService();
    const esfand = (year: number): InvoiceDetailsBody => ({
      ...fuelDetails,
      jalaliYear: year,
      jalaliMonth: 12,
      entries: [{ day: 30, amount: '100000' }],
    } as InvoiceDetailsBody);

    await expect(service.prepare('FUEL', esfand(1405))).rejects.toBeInstanceOf(AppError);

    const leap = await service.prepare('FUEL', esfand(1403));
    expect(leap.items).toHaveLength(1);
  });

  it('ردیف تاریخ به ردیف مالی **همان** شماره ردیف گره می‌خورد', async () => {
    const prepared = await makeService().prepare('FUEL', fuelDetails);

    const createMany = vi.fn(async (_args: { data: Array<Record<string, unknown>> }) => ({
      count: 2,
    }));
    await prepared.writeDetails(
      {
        invoiceFuelDetail: { create: vi.fn(async () => ({})) },
        invoiceFuelEntry: { createMany },
      } as never,
      {
        id: 'invoice-1',
        items: [
          { id: 'item-a', rowNo: 1 },
          { id: 'item-b', rowNo: 2 },
        ],
      },
    );

    expect(createMany.mock.calls[0]?.[0]).toMatchObject({
      data: [
        { invoiceItemId: 'item-a', jalaliDay: 3 },
        { invoiceItemId: 'item-b', jalaliDay: 12 },
      ],
    });
  });

  it('اگر ردیف مالی متناظر ساخته نشده باشد، نوشتن جزئیات شکست می‌خورد', async () => {
    const prepared = await makeService().prepare('FUEL', fuelDetails);

    await expect(
      prepared.writeDetails(
        {
          invoiceFuelDetail: { create: vi.fn(async () => ({})) },
          invoiceFuelEntry: { createMany: vi.fn(async () => ({ count: 0 })) },
        } as never,
        { id: 'invoice-1', items: [{ id: 'item-a', rowNo: 1 }] },
      ),
    ).rejects.toThrowError(/ردیف مالی متناظر/);
  });

  it('خودرو غیرفعال و نوع سوخت غیرفعال رد می‌شوند', async () => {
    const inactiveVehicle = makeService({
      vehicle: { findUnique: vi.fn(async () => ({ ...ACTIVE_VEHICLE, isActive: false })) },
    });
    await expect(inactiveVehicle.prepare('FUEL', fuelDetails)).rejects.toThrowError(/خودرو/);

    const inactiveFuel = makeService({
      fuelType: { findUnique: vi.fn(async () => ({ id: 'f', title: 'بنزین', isActive: false })) },
    });
    await expect(inactiveFuel.prepare('FUEL', fuelDetails)).rejects.toThrowError(/نوع سوخت/);
  });
});
