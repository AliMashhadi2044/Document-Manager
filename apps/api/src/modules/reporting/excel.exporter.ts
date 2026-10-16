import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { LaidOutReport, LaidOutTable } from '@dm/report-engine';

import {
  MAX_SAFE_EXCEL_INTEGER,
  columnLetter,
  safeSheetName,
  thinBorder,
  writeMoney,
  writeText,
} from './excel-safety';

/**
 * خروجی Excel از سند چیدمان (docs/09 §۸).
 *
 * چرا اینجا و نه در بسته موتور: `exceljs` فقط-Node است و بسته موتور عمداً
 * ایزومورفیک مانده تا مرورگر هم بتواند قالب را چیدمان کند. ورودی این کلاس **همان**
 * سند چیدمانی است که HTML از آن ساخته می‌شود، پس جدول Excel و جدول چاپی از یک منبع
 * می‌آیند و نمی‌توانند از هم جدا بیفتند.
 *
 * قواعد نوشتن سلول (سلول مالی عدد واقعی، مبلغ خارج از محدوده امن به‌صورت متن، ضد
 * Formula Injection) در `excel-safety.ts` است و با خروجی‌گیر جدول‌های گزارش‌گیری
 * عمومی مشترک: این‌ها کنترل امنیتی و درستی مالی‌اند و دو نسخه‌شان روزی از هم جدا
 * می‌افتاد.
 */

@Injectable()
export class ExcelExporter {
  async build(report: LaidOutReport): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'سامانه مدیریت اسناد کارپردازی';
    workbook.created = new Date(report.generatedAt);

    const sheet = workbook.addWorksheet(safeSheetName(report.titleFa), {
      views: [{ rightToLeft: true }],
      pageSetup: { orientation: report.page.orientation, fitToPage: true },
    });

    let rowCursor = 1;

    // سربرگ: فقط متن‌ها، به‌صورت ردیف‌های ساده بالای جدول.
    for (const block of report.header) {
      if (block.kind === 'text' && block.text.trim() !== '') {
        const row = sheet.getRow(rowCursor);
        writeText(row.getCell(1), block.text);
        row.getCell(1).font = { bold: block.bold, size: 12 };
        rowCursor += 1;
      }
    }
    rowCursor += 1;

    for (const block of report.body) {
      if (block.kind !== 'table') continue;
      rowCursor = this.writeTable(sheet, block, rowCursor);
      rowCursor += 2;
    }

    // امضاها در انتهای شیت، چون در فایل Excel جای امضا معنا ندارد ولی حذفشان هم
    // اطلاعات را از خروجی کم می‌کند.
    for (const block of report.footer) {
      if (block.kind !== 'signatureRow') continue;
      const row = sheet.getRow(rowCursor);
      block.blocks.forEach((signature, index) => {
        writeText(row.getCell(index * 2 + 1), `${signature.positionTitle}: ${signature.fullName}`);
      });
      rowCursor += 1;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private writeTable(sheet: ExcelJS.Worksheet, table: LaidOutTable, startRow: number): number {
    const headerRow = sheet.getRow(startRow);
    table.columns.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1);
      writeText(cell, column.titleFa);
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder();
      // عرض ستون: میلی‌متر تقریباً به «نویسه» تبدیل می‌شود؛ دقیق نیست و لازم هم نیست.
      sheet.getColumn(index + 1).width =
        column.width.unit === 'mm' && column.width.value ? Math.max(8, column.width.value / 2) : 18;
    });
    headerRow.commit();

    let cursor = startRow + 1;
    const firstDataRow = cursor;

    for (const row of table.rows) {
      const sheetRow = sheet.getRow(cursor);
      row.forEach((cell, index) => {
        const target = sheetRow.getCell(index + 1);
        const column = table.columns[index];

        if (column?.isNumeric && typeof cell.raw === 'bigint') {
          writeMoney(target, cell.raw);
        } else {
          // خطوط چندگانه یک سلول با newline نوشته می‌شوند تا اطلاعات گم نشود.
          const lines = [cell.text, ...cell.extraLines.map((line) => line.text)].filter(
            (line) => line !== '',
          );
          writeText(target, lines.join('\n'));
          target.alignment = { wrapText: true, vertical: 'middle' };
        }
        target.border = thinBorder();
      });
      sheetRow.commit();
      cursor += 1;
    }

    const lastDataRow = cursor - 1;

    if (table.totals) {
      const totalsRow = sheet.getRow(cursor);
      table.columns.forEach((column, index) => {
        const cell = totalsRow.getCell(index + 1);
        const laidOut = table.totals?.[index];

        if (index === 0 && table.totalsLabel !== null) {
          writeText(cell, table.totalsLabel);
        } else if (column.isNumeric && laidOut && typeof laidOut.raw === 'bigint') {
          // **فرمول واقعی**، نه مقدار ثابت: اگر کاربر ردیفی را فیلتر کند، جمع هم
          // به‌روز می‌شود. SUBTOTAL(109,…) ردیف‌های پنهان را نمی‌شمارد.
          if (lastDataRow >= firstDataRow && laidOut.raw <= MAX_SAFE_EXCEL_INTEGER) {
            const letter = columnLetter(index + 1);
            cell.value = { formula: `SUBTOTAL(109,${letter}${firstDataRow}:${letter}${lastDataRow})` };
            cell.numFmt = '#,##0';
          } else {
            writeMoney(cell, laidOut.raw);
          }
        }

        cell.font = { bold: true };
        cell.border = thinBorder();
      });
      totalsRow.commit();
      cursor += 1;
    }

    return cursor;
  }
}

// `safeSheetName`، `columnLetter` و `wouldBeFormula` از `excel-safety.ts` دوباره صادر
// می‌شوند تا مسیرهای واردکننده فعلی (کنترلر و آزمون‌ها) تغییر نکنند.
export { columnLetter, safeSheetName, wouldBeFormula } from './excel-safety';
