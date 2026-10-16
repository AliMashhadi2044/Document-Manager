import { describe, expect, it } from 'vitest';
import { templateV1Schema, type TemplateV1 } from '@dm/report-engine';

import { permissionsForPaths } from './data-dictionary';
import { ReportsService } from './reports.service';

/**
 * مسیرهای داده‌ای قالب و مجوزی که هر مسیر می‌خواهد.
 *
 * این دو با هم یک مرز امنیتی‌اند: اگر مسیر `row.*` با کلید مجموعه‌اش کامل نشود،
 * مجوزِ **فیلد** هیچ‌وقت سنجیده نمی‌شود و قالبی که مدیر ساخته، ریز محاسبات فاکتورها
 * را به نقشی نشان می‌دهد که حق دیدنش را ندارد.
 */

/** سرویس بدون وابستگی: `templatePaths` یک تابع خالص روی قالب است. */
const service = new ReportsService(
  null as never,
  null as never,
  null as never,
  null as never,
);

function templateWithInvoiceTable(): TemplateV1 {
  return templateV1Schema.parse({
    schemaVersion: 1,
    reportTypeKey: 'TAX_REPORT',
    titleFa: 'آزمون مسیرها',
    page: {
      size: 'A4',
      orientation: 'landscape',
      margins: { top: 10, bottom: 10, inlineStart: 10, inlineEnd: 10 },
      direction: 'rtl',
    },
    styles: {
      fontFamily: 'Vazirmatn',
      baseFontSizePt: 9,
      headingFontSizePt: 12,
      tableFontSizePt: 8,
      borderWidthPx: 1,
      borderColor: '#333333',
      textColor: '#000000',
      mutedTextColor: '#555555',
    },
    header: { repeatOnEveryPage: true, blocks: [] },
    footer: { repeatOnEveryPage: false, blocks: [] },
    body: [
      {
        id: 'invoices',
        type: 'table',
        dataSource: 'document.invoices',
        minRows: 0,
        pagination: { repeatHeaderOnNewPage: true, avoidRowBreak: true },
        columns: [
          {
            key: 'tax',
            titleFa: 'مالیات فاکتور',
            width: { unit: 'mm', value: 25 },
            align: 'end',
            value: { k: 'var', path: 'row.taxAmount' },
            format: { kind: 'currency', emptyText: '۰' },
          },
        ],
      },
    ],
  });
}

describe('مسیرهای داده‌ای قالب', () => {
  it('مسیر ردیف با کلید منبع داده کامل می‌شود', () => {
    const paths = service.templatePaths(templateWithInvoiceTable());

    expect([...paths].sort()).toEqual(['document.invoices', 'document.invoices.taxAmount']);
    // مسیر خام `row.*` نباید به بررسی مجوز برسد، چون قابل نسبت دادن به مجموعه نیست.
    expect([...paths].some((path) => path.startsWith('row.'))).toBe(false);
  });

  it('مسیر ردیف داخل تابع تجمیعی به مجموعه خودش نسبت داده می‌شود', () => {
    const template = templateV1Schema.parse({
      ...templateWithInvoiceTable(),
      body: [],
      header: {
        repeatOnEveryPage: true,
        blocks: [
          {
            id: 'sum',
            type: 'variable',
            value: {
              k: 'agg',
              fn: 'sum',
              over: 'document.invoices',
              of: { k: 'var', path: 'row.netAmount' },
            },
            format: { kind: 'currency', emptyText: '۰' },
          },
        ],
      },
    });

    expect([...service.templatePaths(template)].sort()).toEqual([
      'document.invoices',
      'document.invoices.netAmount',
    ]);
  });
});

describe('مجوز لازم برای مسیرهای داده‌ای', () => {
  it('مبلغ تک‌تک فاکتورها مجوز جزئیات محاسبه می‌خواهد', () => {
    const { permissions, unknownPaths } = permissionsForPaths([
      'document.invoices',
      'document.invoices.taxAmount',
    ]);

    expect(unknownPaths).toEqual([]);
    expect([...permissions].sort()).toEqual(['document:read', 'invoice:read_calc_details']);
  });

  it('گزارش تجمیعی فروشنده‌ها مجوز جزئیات محاسبه نمی‌خواهد', () => {
    // بایگانی باید بتواند گزارش مالیات را چاپ کند؛ ریز محاسبات هر فاکتور کار او نیست.
    const { permissions } = permissionsForPaths([
      'document.vendorAggregates',
      'document.vendorAggregates.tax',
    ]);

    expect(permissions.has('invoice:read_calc_details')).toBe(false);
    expect([...permissions].sort()).toEqual(['document:read', 'report:run']);
  });

  it('مسیر ناشناخته گزارش می‌شود، نه نادیده گرفته', () => {
    const { unknownPaths } = permissionsForPaths([
      'users.passwordHash',
      'row.taxAmount',
      'document.invoices.ghostColumn',
    ]);

    expect(unknownPaths.sort()).toEqual([
      'document.invoices.ghostColumn',
      'row.taxAmount',
      'users.passwordHash',
    ]);
  });
});
