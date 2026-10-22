import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { formatJalali, isoDateToJalali } from '@dm/shared';

import {
  columnLetter,
  safeSheetName,
  thinBorder,
  writeMoney,
  writeText,
} from '../reporting/excel-safety';
import type { ReportRow } from './analytics.service';
import type { ReportFieldDefinition } from './datasets';

export interface TableExportMeta {
  readonly titleFa: string;
  /** خطوط توضیح بالای جدول: فیلترهای اعمال‌شده، زمان تولید، نام کاربر. */
  readonly notes: readonly string[];
  readonly generatedAt: Date;
}

/**
 * خروجی Excel برای جدول‌های گزارش‌گیری عمومی.
 *
 * دو تصمیم که این کلاس را از «نوشتن ردیف‌ها» جدا می‌کند:
 *
 *  ۱. **فیلترهای اعمال‌شده بالای فایل نوشته می‌شوند.** فایلی که بیرون از سامانه
 *     می‌رود باید خودش بگوید چه برشی از داده است؛ وگرنه یک فایل با ۲۰۰ ردیف و یک
 *     فایل با ۲۰۰۰ ردیف از یک گزارش، چند ماه بعد قابل تفکیک نیستند.
 *  ۲. **ردیف جمع فرمول `SUBTOTAL` دارد، نه مقدار ثابت** — همان قاعده خروجی‌گیر
 *     گزارش مالیات: اگر کاربر در Excel ردیفی را فیلتر کند، جمع هم به‌روز می‌شود.
 *
 * نوشتن سلول‌ها از `excel-safety.ts` می‌آید: سلول مالی عدد واقعی است، مبلغ خارج از
 * محدوده امن متن می‌شود، و متنِ شروع‌شده با `=` فرمول نمی‌شود.
 */
@Injectable()
export class TableExporter {
  /**
   * ساخت فایل به‌صورت تدریجی.
   *
   * ردیف‌ها از یک generator می‌آیند و دسته‌دسته نوشته می‌شوند، پس یک خروجی ده‌هزار
   * ردیفی هم کل داده را یک‌جا در حافظه نمی‌آورد.
   */
  async build(
    columns: readonly ReportFieldDefinition[],
    batches: AsyncIterable<readonly ReportRow[]>,
    meta: TableExportMeta,
  ): Promise<{ buffer: Buffer; rowCount: number }> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'سامانه مدیریت اسناد کارپردازی';
    workbook.created = meta.generatedAt;

    const sheet = workbook.addWorksheet(safeSheetName(meta.titleFa), {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: meta.notes.length + 3 }],
      pageSetup: { orientation: 'landscape', fitToPage: true },
    });

    let cursor = 1;

    const titleCell = sheet.getRow(cursor).getCell(1);
    writeText(titleCell, meta.titleFa);
    titleCell.font = { bold: true, size: 13 };
    cursor += 1;

    for (const note of meta.notes) {
      writeText(sheet.getRow(cursor).getCell(1), note);
      sheet.getRow(cursor).getCell(1).font = { size: 9, color: { argb: 'FF555555' } };
      cursor += 1;
    }
    cursor += 1;

    const headerRowIndex = cursor;
    const headerRow = sheet.getRow(headerRowIndex);
    columns.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1);
      writeText(cell, column.titleFa);
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder();
      sheet.getColumn(index + 1).width = column.width ?? 18;
    });
    headerRow.commit();
    cursor += 1;

    // فیلتر خودکار Excel روی سرستون‌ها — کاربر می‌تواند همان‌جا باز هم فیلتر کند.
    sheet.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: headerRowIndex, column: columns.length },
    };

    const firstDataRow = cursor;
    let rowCount = 0;

    for await (const batch of batches) {
      for (const row of batch) {
        const sheetRow = sheet.getRow(cursor);
        columns.forEach((column, index) => {
          writeCell(sheetRow.getCell(index + 1), column, row[column.key] ?? null);
        });
        sheetRow.commit();
        cursor += 1;
        rowCount += 1;
      }
    }

    const lastDataRow = cursor - 1;

    if (rowCount > 0) {
      const totalsRow = sheet.getRow(cursor);
      let wroteLabel = false;

      columns.forEach((column, index) => {
        const cell = totalsRow.getCell(index + 1);
        if (column.type === 'money') {
          const letter = columnLetter(index + 1);
          cell.value = { formula: `SUBTOTAL(109,${letter}${firstDataRow}:${letter}${lastDataRow})` };
          cell.numFmt = '#,##0';
        } else if (!wroteLabel) {
          writeText(cell, 'جمع');
          wroteLabel = true;
        }
        cell.font = { bold: true };
        cell.border = thinBorder();
      });
      totalsRow.commit();
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(buffer), rowCount };
  }
}

function writeCell(
  cell: ExcelJS.Cell,
  column: ReportFieldDefinition,
  value: string | number | boolean | null,
): void {
  cell.border = thinBorder();

  if (value === null) {
    cell.value = null;
    return;
  }

  /*
    مقدار enum با **برچسب فارسی‌اش** نوشته می‌شود، نه کلید دیتابیس.

    جدول روی صفحه این نگاشت را سمت کلاینت انجام می‌داد و خروجی Excel نمی‌داد؛ پس
    همان ستونی که در سامانه «ستاد» بود، در فایل `STAD` می‌شد — و فایل، جایی می‌رود
    که کسی کلیدهای دیتابیس را نمی‌شناسد. نگاشت از همان `enumValues`ای می‌آید که
    فیلترساز هم با آن فهرست می‌سازد، پس دو جدول برچسب وجود ندارد.

    مقداری که در فهرست نباشد خام نوشته می‌شود: یک مقدار ناشناخته را پنهان کردن،
    بدتر از نشان دادنش است.
  */
  if (column.enumValues) {
    const raw = String(value);
    const option = column.enumValues.find((item) => item.value === raw);
    writeText(cell, option?.label ?? raw);
    cell.alignment = { horizontal: 'center' };
    return;
  }

  switch (column.type) {
    case 'money':
      // مقدار از مرز API به‌صورت **رشته عددی** می‌آید (ADR-0003).
      writeMoney(cell, BigInt(String(value)));
      return;

    case 'integer':
      cell.value = typeof value === 'number' ? value : Number(value);
      cell.alignment = { horizontal: 'right' };
      return;

    case 'boolean':
      writeText(cell, value === true || value === 'true' ? 'بله' : 'خیر');
      return;

    case 'date':
    case 'jalaliDate':
      /*
       * تاریخ به‌صورت **متن شمسی** نوشته می‌شود، نه سلول تاریخ Excel.
       *
       * Excel تقویم شمسی ندارد و سلول تاریخ را میلادی نشان می‌دهد؛ کاربری که گزارش
       * را باز می‌کند تاریخ‌هایی می‌بیند که با سامانه نمی‌خوانند. متن شمسی خوانا
       * است و با همان چیزی که روی صفحه دیده می‌خواند.
       */
      writeText(cell, toJalaliText(String(value)));
      cell.alignment = { horizontal: 'center' };
      return;

    default:
      writeText(cell, String(value));
      cell.alignment = { wrapText: true, vertical: 'middle' };
  }
}

function toJalaliText(iso: string): string {
  try {
    return formatJalali(isoDateToJalali(iso.slice(0, 10)));
  } catch {
    return iso;
  }
}
