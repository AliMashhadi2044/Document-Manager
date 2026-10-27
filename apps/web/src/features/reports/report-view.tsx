import type { ReactNode } from 'react';

import type { LaidOutReportDto, ReportBlock, ReportTableBlock } from './reports.api';

/**
 * نمایش سند چیدمان گزارش.
 *
 * نکته‌ای که شکل این مؤلفه را تعیین می‌کند: **اینجا هیچ قاعده‌ای از هیچ گزارشی پیاده
 * نشده است.** ستون‌ها، ترتیبشان، قالب اعدادشان و ردیف جمع همگی از سند چیدمانی می‌آیند
 * که سرور با قالب ساخته است. پس همین مؤلفه، هم گزارش مالیات را نشان می‌دهد و هم هر
 * قالبی که در طراح فاز ۷ ساخته شود — بدون یک خط تغییر.
 *
 * اقدام‌های روی ردیف جزو گزارش نیستند و کار کاربرند، پس اینجا هم تعریف نمی‌شوند:
 * صفحهٔ پیش‌نمایش یک تابع می‌دهد و هر چه خواست می‌سازد. همین باعث شد گزارش دوم
 * (شبای ذینفعان) با اقدام‌های کاملاً متفاوت، بدون یک خط تغییر در این فایل بنشیند —
 * پیش از این، نام و شناسهٔ **فروشنده** در امضای همین مؤلفه سفت شده بود.
 */
export function ReportView({
  report,
  renderRowActions,
}: {
  report: LaidOutReportDto;
  /**
   * اقدام‌های یک ردیف؛ `null` یعنی این ردیف اقدامی ندارد.
   *
   * اگر هیچ ردیفی اقدام نداشته باشد، ستون «اقدام» اصلاً ساخته نمی‌شود — پیش‌نمایش
   * طراح همین حالت را می‌خواهد.
   */
  renderRowActions?:
    | ((rowIndex: number, cells: ReportTableBlock['rows'][number]) => ReactNode)
    | undefined;
}): JSX.Element {
  return (
    <article
      dir="rtl"
      className="rounded-lg border border-border bg-card p-6 print:border-0 print:p-0"
    >
      <header className="space-y-1 text-center">
        {report.header.map((block) => (
          <RenderBlock key={block.id} block={block} />
        ))}
      </header>

      <div className="mt-5 space-y-5">
        {report.body.map((block) =>
          block.kind === 'table' ? (
            <ReportTable key={block.id} table={block} renderRowActions={renderRowActions} />
          ) : (
            <RenderBlock key={block.id} block={block} />
          ),
        )}
      </div>

      <footer className="mt-8">
        {report.footer.map((block) => (
          <RenderBlock key={block.id} block={block} />
        ))}
      </footer>
    </article>
  );
}

function RenderBlock({ block }: { block: ReportBlock }): JSX.Element | null {
  switch (block.kind) {
    case 'text':
      return (
        <p
          className={[
            block.bold ? 'font-bold' : '',
            block.align === 'center' ? 'text-center' : block.align === 'end' ? 'text-end' : 'text-start',
          ].join(' ')}
          style={block.fontSizePt === null ? undefined : { fontSize: `${block.fontSizePt}pt` }}
        >
          {block.text}
        </p>
      );

    case 'variable':
      return (
        <p className="text-sm">
          {block.labelFa ? <span className="text-muted-foreground">{block.labelFa}: </span> : null}
          {block.text}
        </p>
      );

    case 'divider':
      return <hr className="my-3 border-border" />;

    case 'spacer':
      return <div style={{ height: `${block.heightMm}mm` }} />;

    case 'signature':
      return <SignatureBlock block={block} />;

    case 'signatureRow':
      return (
        <div className="flex flex-wrap justify-between gap-10">
          {block.blocks.map((item) => (
            <SignatureBlock key={item.id} block={item} />
          ))}
        </div>
      );

    case 'pageNumber':
      return null; // شماره صفحه را موتور چاپ پر می‌کند، نه نمایش روی صفحه.

    case 'table':
      return null; // جدول مسیر خودش را دارد (اقدام‌های ردیف).
  }
}

function SignatureBlock({
  block,
}: {
  block: Extract<ReportBlock, { kind: 'signature' }>;
}): JSX.Element {
  return (
    <div className="min-w-48 break-inside-avoid text-center">
      <div className="font-bold">{block.positionTitle}</div>
      <div style={{ height: `${block.spaceMm}mm` }} />
      <div className="font-bold">{block.fullName}</div>
    </div>
  );
}

function ReportTable({
  table,
  renderRowActions,
}: {
  table: ReportTableBlock;
  renderRowActions?:
    | ((rowIndex: number, cells: ReportTableBlock['rows'][number]) => ReactNode)
    | undefined;
}): JSX.Element {
  const actions = table.rows.map((row, index) => renderRowActions?.(index, row) ?? null);
  const hasActions = actions.some((action) => action !== null);
  const hasSubtitles = table.columns.some((column) => column.subtitleFa !== null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-xs">
        <colgroup>
          {table.columns.map((column) => (
            <col
              key={column.key}
              style={
                column.width.unit === 'auto' || column.width.value === undefined
                  ? undefined
                  : {
                      width:
                        column.width.unit === 'mm'
                          ? `${column.width.value}mm`
                          : `${column.width.value}%`,
                    }
              }
            />
          ))}
          {hasActions ? <col className="no-print" style={{ width: '22mm' }} /> : null}
        </colgroup>

        {/*
          سرستون دوطبقه.

          ستون فصل بالا عنوان دارد و پایین کد؛ ستون‌های بی‌زیرعنوان هر دو طبقه را
          می‌گیرند. وقتی هیچ ستونی زیرعنوان ندارد، همان سرستون یک‌خطیِ همیشگی
          می‌ماند و طبقهٔ دومِ خالی ساخته نمی‌شود.
        */}
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th
                key={column.key}
                rowSpan={hasSubtitles && column.subtitleFa === null ? 2 : undefined}
                className="border border-border px-1.5 py-1 text-center font-bold"
              >
                {column.titleFa}
              </th>
            ))}
            {hasActions ? (
              <th
                rowSpan={hasSubtitles ? 2 : undefined}
                className="no-print border border-border px-1.5 py-1 text-center"
              >
                اقدام
              </th>
            ) : null}
          </tr>
          {hasSubtitles ? (
            <tr>
              {table.columns
                .filter((column) => column.subtitleFa !== null)
                .map((column) => (
                  <th
                    key={`${column.key}-subtitle`}
                    className="border border-border px-1.5 py-1 text-center font-bold"
                  >
                    {column.subtitleFa}
                  </th>
                ))}
            </tr>
          ) : null}
        </thead>

        <tbody>
          {table.rows.map((row, rowIndex) => {
            return (
              <tr key={`row-${rowIndex}`} className="break-inside-avoid">
                {row.map((cell, cellIndex) => (
                  <td
                    key={table.columns[cellIndex]?.key ?? cellIndex}
                    className={
                      cell.extraLines.length === 0
                        ? `border border-border px-1.5 py-1 align-middle ${alignClass(cell.align)}`
                        : `border border-border align-middle ${alignClass(cell.align)}`
                    }
                  >
                    {/*
                      سلولی که دو مقدار دارد، با یک خط افقی به دو نیمه تقسیم
                      می‌شود — مثل فرم کاغذی. مقدار دومِ خالی اصلاً خطی نمی‌سازد
                      (چیدمان از قبل حذفش کرده)، پس سلول یک‌تکه می‌ماند.
                    */}
                    {cell.extraLines.length === 0 ? (
                      <span className="block leading-6">{cell.text}</span>
                    ) : (
                      <>
                        <span className="block px-1.5 py-1 leading-6">{cell.text}</span>
                        {cell.extraLines.map((line, lineIndex) => (
                          <span
                            key={`line-${lineIndex}`}
                            className={`block border-t border-border px-1.5 py-1 leading-6 ${
                              line.muted ? 'text-[0.9em] text-muted-foreground' : ''
                            }`}
                          >
                            {line.text}
                          </span>
                        ))}
                      </>
                    )}
                  </td>
                ))}
                {hasActions ? (
                  <td className="no-print border border-border px-1 py-1 text-center">
                    {actions[rowIndex]}
                  </td>
                ) : null}
              </tr>
            );
          })}

          {/*
            ردیف‌های خالی فرم چاپی — محتوایشان را چیدمان ساخته است: فقط شمارهٔ
            ردیف، تا شمارش پیوسته بماند. «۰» در ستون مبلغِ یک ردیف خالی، عددی
            است که وجود ندارد.
          */}
          {table.fillerRows.map((row, index) => (
            <tr key={`filler-${index}`}>
              {row.map((cell, cellIndex) => (
                <td
                  key={table.columns[cellIndex]?.key ?? cellIndex}
                  className={`h-8 border border-border px-1.5 py-1 ${alignClass(cell.align)}`}
                >
                  {cell.text}
                </td>
              ))}
              {hasActions ? <td className="no-print border border-border" /> : null}
            </tr>
          ))}
        </tbody>

        {/*
          ردیف جمع آخرین ردیف بدنه است، نه tfoot: tfoot در چاپ روی هر صفحه تکرار
          می‌شود و «جمع کل» تکرارشده، به‌جای جمع همه ردیف‌ها، جمع همان صفحه خوانده
          می‌شود.
        */}
        {table.totals ? (
          <tbody>
            <tr className="font-bold">
              {/*
                برچسب «جمع کل» ستون‌های ابتدایی را با هم می‌گیرد؛ در ستون «ردیف»
                که چند میلی‌متر عرض دارد، می‌شکست و از سلول بیرون می‌زد.
              */}
              {table.totals.map((cell, index) => {
                if (table.totalsLabel === null) {
                  return (
                    <td
                      key={table.columns[index]?.key ?? index}
                      className={`border border-border px-1.5 py-1 ${alignClass(cell.align)}`}
                    >
                      {cell.text}
                    </td>
                  );
                }

                if (index === 0) {
                  return (
                    <td
                      key={table.columns[index]?.key ?? index}
                      colSpan={table.totalsLabelSpan}
                      className="border border-border px-1.5 py-1 text-center"
                    >
                      {table.totalsLabel}
                    </td>
                  );
                }

                /*
                  پهنای هر سلول از چیدمان می‌آید.

                  سلولِ «جمع به حروف» چند ستون را می‌گیرد — همان کاری که فرم کاغذی
                  با ادغام خانه‌ها می‌کند — و ستون‌های پوشانده‌شده پهنای صفر دارند.
                */
                const span = table.totalsSpans[index] ?? 1;
                if (span === 0) return null;

                return (
                  <td
                    key={table.columns[index]?.key ?? index}
                    colSpan={span > 1 ? span : undefined}
                    className={`border border-border px-1.5 py-1 ${alignClass(cell.align)}`}
                  >
                    {cell.text}
                  </td>
                );
              })}
              {hasActions ? <td className="no-print border border-border" /> : null}
            </tr>
          </tbody>
        ) : null}
      </table>
    </div>
  );
}

function alignClass(align: 'start' | 'center' | 'end'): string {
  return align === 'center' ? 'text-center' : align === 'end' ? 'text-end' : 'text-start';
}
