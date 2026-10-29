import { describe, expect, it } from 'vitest';
import { layoutReport, printableWidthMm, templateV1Schema, validateTemplate } from '@dm/report-engine';

import { allowedValuePaths, collectionFields } from './data-dictionary';
import taxReport from '../../../prisma/seed/templates/tax-report.json';
import beneficiaryIban from '../../../prisma/seed/templates/beneficiary-iban-report.json';
import capitalExpense from '../../../prisma/seed/templates/capital-expense-report.json';
import currentExpense from '../../../prisma/seed/templates/current-expense-report.json';
import fuelExpense from '../../../prisma/seed/templates/fuel-expense-report.json';

/**
 * قالب‌های سیستمی، در برابر فهرست داده و عرض صفحه.
 *
 * seed همین دو بررسی را می‌کند، ولی seed فقط وقتی اجرا می‌شود که کسی اجرایش کند.
 * قالبی که به ستونی اشاره کند که دیگر وجود ندارد، باید **اینجا** قرمز شود و نه در
 * دستِ کاربری که فرم را چاپ کرده و سلول خالی می‌بیند.
 */

const TEMPLATES: readonly { readonly name: string; readonly raw: unknown }[] = [
  { name: 'گزارش مالیات بر ارزش افزوده', raw: taxReport },
  { name: 'شماره شبا ذینفعان سند', raw: beneficiaryIban },
  { name: 'صورت ریز هزینه‌های عمرانی', raw: capitalExpense },
  { name: 'صورت ریز هزینه‌های جاری', raw: currentExpense },
  { name: 'لیست هزینه سوخت', raw: fuelExpense },
];

describe('قالب‌های سیستمی', () => {
  it.each(TEMPLATES)('$name با schema و فهرست داده می‌خواند', ({ raw }) => {
    const template = templateV1Schema.parse(raw);

    const problems = validateTemplate(template, {
      allowedValuePaths: allowedValuePaths(),
      collections: collectionFields(),
    });

    expect(problems.map((item) => item.message)).toEqual([]);
  });
});

/**
 * فرم سوخت.
 *
 * ترتیب ستون‌ها بخشی از **خواستهٔ کاربر** است و نه جزئیات پیاده‌سازی: فرم کاغذی
 * همین ترتیب را دارد و جابه‌جا شدنشان یعنی فرمی که با نمونه نمی‌خواند.
 */
describe('فرم هزینه سوخت', () => {
  const template = templateV1Schema.parse(fuelExpense);

  const ROWS = [
    {
      index: 1,
      invoiceId: 'i-1',
      vehicleTypeTitle: 'سمند',
      plateNumber: '۱۲الف۱۲۴',
      fuelTypeTitle: 'گاز',
      jalaliYear: 1405,
      jalaliMonth: 6,
      total: '90000',
    },
    {
      index: 2,
      invoiceId: 'i-2',
      vehicleTypeTitle: 'سمند',
      plateNumber: '۱۲الف۱۲۴',
      fuelTypeTitle: 'بنزین',
      jalaliYear: 1405,
      jalaliMonth: 6,
      total: '1750000',
    },
  ];

  function laidOut() {
    return layoutReport(template, {
      values: { organization: { name: 'اداره' }, document: { title: 'سند', fiscalYear: 1405 } },
      collections: { 'document.fuelExpenses': ROWS },
      signatories: [],
      roundingMode: 'HALF_UP',
      generatedAt: '2026-09-22',
    } as never);
  }

  /** جدول چیدمان‌شده — تنها جدول این فرم. */
  function fuelTable() {
    const table = laidOut().body.find((block) => block.kind === 'table');
    if (!table || table.kind !== 'table') throw new Error('جدول فرم سوخت پیدا نشد');
    return table;
  }

  it('ستون‌ها به ترتیب نوع خودرو، شماره خودرو، نوع سوخت و مبلغ‌اند', () => {
    const table = fuelTable();

    expect(table.columns.map((column) => column.key)).toEqual([
      'vehicleTypeTitle',
      'plateNumber',
      'fuelTypeTitle',
      'total',
    ]);
    expect(table.columns.map((column) => column.titleFa)).toEqual([
      'نوع خودرو',
      'شماره خودرو',
      'نوع سوخت',
      'مبلغ فاکتور',
    ]);
  });

  it('ردیف جمع کل، جمع مبلغ‌ها را می‌دهد و برچسبش سه ستون را می‌گیرد', () => {
    const table = fuelTable();

    expect(table.totalsLabelSpan, 'برچسب جمع کل زیر ستون مبلغ نمی‌نشیند').toBe(3);
    expect(table.totalsLabel).toBe('جمع کل');
    // ۹۰٬۰۰۰ + ۱٬۷۵۰٬۰۰۰ — با رقم فارسی و جداکنندهٔ هزارگان، همان‌طور که چاپ می‌شود.
    expect(table.totals?.at(-1)?.text).toBe('۱٬۸۴۰٬۰۰۰');
  });

  it('جدول در عرض قابل چاپ صفحه جا می‌شود', () => {
    const total = template.body
      .filter((block) => block.type === 'table')
      .flatMap((block) => (block as { columns: { width: { value: number } }[] }).columns)
      .reduce((sum, column) => sum + column.width.value, 0);

    expect(total).toBeLessThanOrEqual(printableWidthMm(template.page));
  });

  /** امضای «مسئول امور اداری» همان چیزی است که فرم زیرش می‌خواهد. */
  it('امضای مسئول امور اداری در پاورقی هست', () => {
    const keys = template.footer.blocks
      .filter((block) => block.type === 'signatureRow')
      .flatMap((block) => (block as { blocks: { signatoryRoleKey: string }[] }).blocks)
      .map((block) => block.signatoryRoleKey);

    expect(keys).toContain('ADMIN_AFFAIRS_LEAD');
  });
});
