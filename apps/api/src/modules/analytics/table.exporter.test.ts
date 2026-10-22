import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { DATASET_BY_KEY } from './datasets';
import { TableExporter } from './table.exporter';
import type { ReportFieldDefinition } from './datasets';

/**
 * خروجی Excel، همان چیزی را می‌نویسد که کاربر روی صفحه می‌خواند.
 *
 * باگی که این آزمون می‌بندد: ستون enum با **کلید دیتابیس** نوشته می‌شد — ستونی که
 * در سامانه «ستاد» بود، در فایل `STAD` می‌شد. جدولِ روی صفحه این نگاشت را سمت
 * کلاینت انجام می‌داد و خروجی، که جایی می‌رود که کسی کلیدهای دیتابیس را نمی‌شناسد،
 * نمی‌داد.
 */

function fieldOf(datasetKey: string, fieldKey: string): ReportFieldDefinition {
  const field = DATASET_BY_KEY.get(datasetKey)?.fields.find((item) => item.key === fieldKey);
  if (!field) throw new Error(`فیلد ${fieldKey} در ${datasetKey} نیست`);
  return field;
}

async function cellsOf(
  columns: readonly ReportFieldDefinition[],
  row: Record<string, string>,
): Promise<string[]> {
  const { buffer } = await new TableExporter().build(
    columns,
    (async function* batches() {
      yield [row];
    })(),
    { titleFa: 'آزمون', notes: [], generatedAt: new Date('2026-10-22T00:00:00.000Z') },
  );

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0]!;

  // ردیف اول عنوان است، بعد یک ردیف خالی، بعد سرستون‌ها، بعد داده.
  const header = sheet.getRow(3);
  const data = sheet.getRow(4);
  expect(String(header.getCell(1).value)).toBe(columns[0]!.titleFa);

  return columns.map((_column, index) => String(data.getCell(index + 1).value ?? ''));
}

describe('خروجی Excel جدول گزارش', () => {
  it('نوع سند را با برچسب فارسی می‌نویسد، نه با کلید دیتابیس', async () => {
    const type = fieldOf('documents', 'type');
    expect(type.enumValues, 'این فیلد دیگر enum نیست').toBeTruthy();

    const [cell] = await cellsOf([type], { type: 'STAD' });
    expect(cell).toBe('ستاد');
    expect(cell).not.toBe('STAD');
  });

  it('وضعیت سند و نوع فاکتور هم همین‌طور', async () => {
    const status = fieldOf('documents', 'status');
    const [statusCell] = await cellsOf([status], { status: 'FINALIZED' });
    expect(statusCell).toBe('ثبت نهایی');

    const kind = fieldOf('invoices', 'invoiceKind');
    const [kindCell] = await cellsOf([kind], { invoiceKind: 'UTILITY' });
    expect(kindCell).toBe('انشعابات');
  });

  /*
    مقدار ناشناخته خام می‌ماند: فهرست enum با مهاجرت دیتابیس جلو می‌رود و اگر یکی از
    آن دو عقب بماند، نوشتن خالی به‌جای مقدار، خطا را پنهان می‌کند.
  */
  it('مقداری که در فهرست نیست را خام می‌نویسد، نه خالی', async () => {
    const type = fieldOf('documents', 'type');
    const [cell] = await cellsOf([type], { type: 'SOMETHING_NEW' });
    expect(cell).toBe('SOMETHING_NEW');
  });
});
