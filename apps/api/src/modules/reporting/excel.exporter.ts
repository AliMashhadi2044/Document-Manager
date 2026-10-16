import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { LaidOutReport, LaidOutTable } from '@dm/report-engine';

/**
 * خروجی Excel از سند چیدمان (docs/09 §۸).
 *
 * چرا اینجا و نه در بسته موتور: `exceljs` فقط-Node است و بسته موتور عمداً
 * ایزومورفیک مانده تا مرورگر هم بتواند قالب را چیدمان کند. ورودی این کلاس **همان**
 * سند چیدمانی است که HTML از آن ساخته می‌شود، پس جدول Excel و جدول چاپی از یک منبع
 * می‌آیند و نمی‌توانند از هم جدا بیفتند.
 *
 * سه قاعده‌ای که این فایل را از یک «نوشتن سلول‌ها» جدا می‌کند:
 *
 *  ۱. **سلول مالی عدد واقعی است**، نه متنِ فارسی‌شده؛ وگرنه کاربر نمی‌تواند در Excel
 *     جمع بزند یا فیلتر کند.
 *  ۲. **مبلغ بزرگ‌تر از محدوده امن Excel متن می‌شود، با هشدار.** Excel اعداد را با
 *     دقت ۱۵ رقم اعشاری نگه می‌دارد؛ مبلغ ریالی بزرگ‌تر از آن بی‌صدا گرد می‌شود و
 *     گرد شدن بی‌صدا در یک سامانه مالی، بدترین حالت ممکن است.
 *  ۳. **ضد Formula Injection:** متنی که با `= + - @` یا tab/CR شروع شود، با پیشوند
 *     `'` نوشته می‌شود تا Excel آن را فرمول نشمارد.
 */

/** سقف امنِ عدد در Excel (همان `Number.MAX_SAFE_INTEGER`). */
const MAX_SAFE_EXCEL_INTEGER = 9_007_199_254_740_991n;

const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

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

/**
 * نوشتن مبلغ.
 *
 * بالاتر از محدوده امن، مقدار **متن** می‌شود و یک هشدار در یادداشت سلول می‌نشیند؛
 * عدد ناقص بدتر از متن درست است.
 */
function writeMoney(cell: ExcelJS.Cell, value: bigint): void {
  if (value <= MAX_SAFE_EXCEL_INTEGER && value >= -MAX_SAFE_EXCEL_INTEGER) {
    cell.value = Number(value);
    cell.numFmt = '#,##0';
    cell.alignment = { horizontal: 'right' };
    return;
  }

  cell.value = value.toString();
  cell.alignment = { horizontal: 'right' };
  cell.note = 'این مبلغ از محدوده دقت عددی Excel بزرگ‌تر است و به‌صورت متن نوشته شده تا گرد نشود.';
}

/** نوشتن متن با خنثی‌سازی Formula Injection. */
function writeText(cell: ExcelJS.Cell, value: string): void {
  if (value === '') {
    cell.value = null;
    return;
  }
  cell.value = FORMULA_TRIGGERS.some((trigger) => value.startsWith(trigger)) ? `'${value}` : value;
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const style = { style: 'thin' as const, color: { argb: 'FF333333' } };
  return { top: style, bottom: style, left: style, right: style };
}

/** نام شیت: حداکثر ۳۱ نویسه، بدون نویسه‌های ممنوع Excel. */
export function safeSheetName(title: string): string {
  const cleaned = title.replace(/[:\\/?*[\]]/gu, ' ').trim();
  const limited = cleaned.slice(0, 31);
  return limited === '' ? 'گزارش' : limited;
}

export function columnLetter(index: number): string {
  let out = '';
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

/** صادر شده برای تست: آیا این متن در Excel فرمول می‌شد؟ */
export function wouldBeFormula(value: string): boolean {
  return FORMULA_TRIGGERS.some((trigger) => value.startsWith(trigger));
}
