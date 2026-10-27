/**
 * رندر HTML چاپی از سند چیدمان.
 *
 * دو قاعده سخت:
 *
 *  ۱. **هیچ HTML خامی از داده عبور نمی‌کند.** هر متنی که از داده می‌آید از `escapeHtml`
 *     رد می‌شود. نام فروشنده‌ای که `<img onerror=…>` باشد، متن چاپ می‌شود نه تگ
 *     (ریسک XSS در docs/09 §۱۰).
 *
 *  ۲. **هیچ منبع خارجی بارگذاری نمی‌شود.** نه فونت از CDN، نه تصویر از اینترنت. صفحه
 *     رندر در تولید PDF بدون شبکه اجرا می‌شود و باید همان‌طور هم درست دربیاید.
 */

import type {
  LaidOutBlock,
  LaidOutCell,
  LaidOutReport,
  LaidOutTable,
} from './layout.js';

const PAGE_SIZES: Record<string, string> = {
  A4: 'A4',
  A5: 'A5',
  A3: 'A3',
  LETTER: 'letter',
};

export interface HtmlRenderOptions {
  /** فونت محلی برای چاپ؛ باید در همان محیط موجود باشد (ریسک R3). */
  readonly fontFaceCss?: string;
  /** بخش غیرچاپی بالای صفحه (دکمه چاپ و هشدارها) — در چاپ حذف می‌شود. */
  readonly toolbarHtml?: string;
}

export function renderReportHtml(
  report: LaidOutReport,
  options: HtmlRenderOptions = {},
): string {
  const css = buildCss(report, options.fontFaceCss ?? '');

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(report.titleFa)}</title>
<style>${css}</style>
</head>
<body>
${options.toolbarHtml ?? ''}
<div class="sheet">
  <header class="report-header">${renderBlocks(report.header)}</header>
  <main class="report-body">${renderBlocks(report.body)}</main>
  <footer class="report-footer">${renderBlocks(report.footer)}</footer>
</div>
</body>
</html>`;
}

function renderBlocks(blocks: readonly LaidOutBlock[]): string {
  return blocks.map(renderBlock).join('\n');
}

function renderBlock(block: LaidOutBlock): string {
  switch (block.kind) {
    case 'text':
      return `<p class="block-text align-${block.align}${block.bold ? ' bold' : ''}"${
        block.fontSizePt === null ? '' : ` style="font-size:${block.fontSizePt}pt"`
      }>${escapeHtml(block.text)}</p>`;

    case 'variable':
      return `<p class="block-variable align-${block.align}">${
        block.labelFa === null ? '' : `<span class="label">${escapeHtml(block.labelFa)}:</span> `
      }<span class="value">${escapeHtml(block.text)}</span></p>`;

    case 'table':
      return renderTable(block);

    case 'signature':
      return renderSignature(block);

    case 'signatureRow':
      return `<div class="signature-row">${block.blocks.map(renderSignature).join('')}</div>`;

    case 'divider':
      return '<hr class="block-divider">';

    case 'spacer':
      return `<div class="block-spacer" style="height:${block.heightMm}mm"></div>`;

    case 'pageNumber':
      // شماره صفحه را موتور چاپ مرورگر پر می‌کند؛ اینجا فقط جایش نگه داشته می‌شود.
      return `<p class="block-page-number">${escapeHtml(block.templateFa)}</p>`;
  }
}

function renderSignature(block: Extract<LaidOutBlock, { kind: 'signature' }>): string {
  return `<div class="signature-block align-${block.align}">
  <div class="signature-title">${escapeHtml(block.positionTitle)}</div>
  <div class="signature-space" style="height:${block.spaceMm}mm"></div>
  <div class="signature-name">${escapeHtml(block.fullName)}</div>
</div>`;
}

function renderTable(table: LaidOutTable): string {
  const colgroup = table.columns
    .map((column) => {
      if (column.width.unit === 'auto' || column.width.value === undefined) return '<col>';
      const width =
        column.width.unit === 'mm' ? `${column.width.value}mm` : `${column.width.value}%`;
      return `<col style="width:${width}">`;
    })
    .join('');

  /*
    سرستون: یک طبقه، یا دو طبقه وقتی ستونی زیرعنوان دارد.

    فرم کاغذی بالای هر ستونِ فصل دو چیز می‌نویسد: عنوان فصل و کدش. ستون‌هایی که
    زیرعنوان ندارند (ردیف، شرح، جمع) هر دو طبقه را می‌گیرند — همان ادغام عمودیِ
    خانه در فرم.
  */
  const hasSubtitles = table.columns.some((column) => column.subtitleFa !== null);

  const head = hasSubtitles
    ? `<tr>${table.columns
        .map((column) =>
          column.subtitleFa === null
            ? `<th class="align-center" rowspan="2">${escapeHtml(column.titleFa)}</th>`
            : `<th class="align-center">${escapeHtml(column.titleFa)}</th>`,
        )
        .join('')}</tr>
<tr>${table.columns
        .filter((column) => column.subtitleFa !== null)
        .map((column) => `<th class="align-center">${escapeHtml(column.subtitleFa ?? '')}</th>`)
        .join('')}</tr>`
    : `<tr>${table.columns
        .map((column) => `<th class="align-center">${escapeHtml(column.titleFa)}</th>`)
        .join('')}</tr>`;

  const body = table.rows.map((row) => `<tr>${row.map(renderCell).join('')}</tr>`).join('\n');

  // ردیف‌های خالی پرکننده: فرم چاپی تعداد ردیف ثابت دارد. محتوایشان را چیدمان
  // ساخته است — فقط شمارهٔ ردیف دارند، نه «۰» در ستون‌های عددی.
  const fillers = table.fillerRows
    .map((row) => `<tr class="filler-row">${row.map(renderCell).join('')}</tr>`)
    .join('\n');

  /**
   * ردیف جمع، **آخرین ردیف بدنه** است، نه `<tfoot>`.
   *
   * چرا: `tfoot` در چاپ روی **هر صفحه** تکرار می‌شود. برای یک ردیف «ادامه دارد»
   * درست است، ولی ردیف ما «جمع کل» است؛ تکرارش پای صفحه دوم به خواننده می‌گوید جمع
   * ردیف‌های بالای همان صفحه این عدد است، در حالی که جمع کل همه صفحه‌هاست. یک گزارش
   * مالی نباید چنین ابهامی داشته باشد.
   *
   * (در آزمون PDF چهارصفحه‌ای فاز ۶ همین دیده شد.)
   */
  /*
    برچسب جمع، ستون‌های ابتدایی را **با هم** می‌گیرد.

    پیش از این فقط در ستون اول می‌نشست — ستون «ردیف» با چند میلی‌متر عرض — و
    «جمع کل» آنجا می‌شکست و از سلول بیرون می‌زد.
  */
  const totals =
    table.totals === null
      ? ''
      : `<tr class="totals-row">${table.totals
          .map((cell, index) => {
            if (table.totalsLabel === null) return renderCell(cell);
            if (index === 0) {
              const span = table.totalsLabelSpan > 1 ? ` colspan="${table.totalsLabelSpan}"` : '';
              return `<td class="align-center"${span}>${escapeHtml(table.totalsLabel)}</td>`;
            }

            /*
              پهنای سلول از چیدمان می‌آید، نه از حدسِ اینجا.

              سلولِ «جمع به حروف» چند ستون را می‌گیرد و ستون‌های پوشانده‌شده پهنای
              صفر دارند؛ رد کردنشان همان کاری است که ادغام خانه در فرم کاغذی
              می‌کند.
            */
            const span = table.totalsSpans[index] ?? 1;
            if (span === 0) return '';
            return renderCell(cell, span);
          })
          .join('')}</tr>`;

  return `<table class="report-table${table.avoidRowBreak ? ' avoid-row-break' : ''}">
<colgroup>${colgroup}</colgroup>
<thead>${head}</thead>
<tbody>
${body}
${fillers}
${totals}
</tbody>
</table>`;
}

/**
 * یک سلول.
 *
 * سلولی که دو مقدار دارد (شمارهٔ صورت‌حساب و تاریخش، نام و کد ملی) با یک خط افقی
 * به دو نیمه تقسیم می‌شود — همان کاری که فرم کاغذی می‌کند. اگر مقدار دوم نباشد،
 * سلول مثل هر سلول دیگری یک‌تکه می‌ماند؛ خط جداکننده روی یک نیمهٔ خالی فقط جدول را
 * شلوغ می‌کند. (خط‌های بی‌متن را چیدمان از قبل حذف کرده است.)
 */
function renderCell(cell: LaidOutCell, colspan = 1): string {
  const span = colspan > 1 ? ` colspan="${colspan}"` : '';

  if (cell.extraLines.length === 0) {
    return `<td class="align-${cell.align}"${span}><span class="cell-line">${escapeHtml(
      cell.text,
    )}</span></td>`;
  }

  const parts = [
    `<span class="cell-part">${escapeHtml(cell.text)}</span>`,
    ...cell.extraLines.map(
      (line) =>
        `<span class="cell-part${line.muted ? ' muted' : ''}">${escapeHtml(line.text)}</span>`,
    ),
  ].join('');

  return `<td class="align-${cell.align} split-cell"${span}>${parts}</td>`;
}

function buildCss(report: LaidOutReport, fontFaceCss: string): string {
  const { page, styles } = report;
  const size = `${PAGE_SIZES[page.size] ?? 'A4'} ${page.orientation}`;

  return `${fontFaceCss}
:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #ffffff;
  color: ${styles.textColor};
  font-family: ${styles.fontFamily};
  font-size: ${styles.baseFontSizePt}pt;
}
@page {
  size: ${size};
  margin: ${page.margins.top}mm ${page.margins.inlineEnd}mm ${page.margins.bottom}mm ${page.margins.inlineStart}mm;
}
.sheet { padding: ${page.margins.top}mm ${page.margins.inlineEnd}mm ${page.margins.bottom}mm ${page.margins.inlineStart}mm; }
@media print { .sheet { padding: 0; } .no-print { display: none !important; } }

.report-header { margin-bottom: 4mm; }
.report-footer { margin-top: 8mm; }
.block-text { margin: 0 0 1.5mm; line-height: 1.7; }
.block-text.bold { font-weight: 700; }
.block-variable { margin: 0 0 1mm; }
.block-variable .label { color: ${styles.mutedTextColor}; }
.block-divider { border: 0; border-top: ${styles.borderWidthPx}px solid ${styles.borderColor}; margin: 3mm 0; }
.block-page-number { text-align: center; color: ${styles.mutedTextColor}; }
.align-start { text-align: start; }
.align-center { text-align: center; }
.align-end { text-align: end; }

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: ${styles.tableFontSizePt}pt;
  /* چیدمان ثابت: عرض ستون‌ها از colgroup می‌آید، نه از طول محتوا؛ وگرنه یک آدرس بلند
     ستون‌های مبلغ را له می‌کند و ستون بریده می‌شود. */
  table-layout: fixed;
}
.report-table th, .report-table td {
  border: ${styles.borderWidthPx}px solid ${styles.borderColor};
  padding: 1.2mm 1.5mm;
  vertical-align: middle;
  /* شکستن کلمه بلند به‌جای سرریز از کادر. */
  overflow-wrap: anywhere;
}
.report-table th { font-weight: 700; background: #ffffff; }
.report-table .cell-line { display: block; line-height: 1.6; }
/* سلول دوبخشی: خط افقی میانش، مثل فرم کاغذی. */
.report-table .split-cell { padding: 0; }
.report-table .split-cell .cell-part { display: block; padding: 1mm 1.5mm; line-height: 1.5; }
.report-table .split-cell .cell-part + .cell-part { border-top: ${styles.borderWidthPx}px solid ${styles.borderColor}; }
.report-table .split-cell .cell-part.muted { color: ${styles.mutedTextColor}; font-size: 0.9em; }
.report-table .cell-line.muted { color: ${styles.mutedTextColor}; font-size: 0.9em; }
.report-table .filler-row td { height: 8mm; }
.report-table .totals-row td { font-weight: 700; }

/* تکرار سرستون در هر صفحه چاپ و جلوگیری از شکستن ردیف. */
thead { display: table-header-group; }
tfoot { display: table-footer-group; }
.avoid-row-break tr { break-inside: avoid; }

.signature-row { display: flex; justify-content: space-between; gap: 10mm; margin-top: 6mm; }
.signature-block { break-inside: avoid; min-width: 50mm; }
.signature-title { font-weight: 700; }
.signature-name { font-weight: 700; }
.signature-block.align-center { text-align: center; }
.signature-block.align-end { text-align: end; }
`;
}

/**
 * escape برای HTML.
 *
 * هر پنج نویسه با هم: `&` اول، وگرنه escapeهای بعدی دوباره escape می‌شوند.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}
