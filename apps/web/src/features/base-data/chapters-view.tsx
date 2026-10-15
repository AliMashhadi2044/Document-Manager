import { INVOICE_KIND_LABELS } from '@dm/shared';

import { ErrorState, LoadingState } from '../../shared/ui/states';
import { useBudgetCategories } from './base-data.api';

/**
 * فصل‌های بودجه و انواع فاکتور مجازشان.
 *
 * این صفحه نشان می‌دهد که انتخاب فرم فاکتور از **داده** می‌آید، نه از شرط در کد:
 * با انتخاب هر فصل، همین فهرست تعیین می‌کند کدام فرم باز شود (docs/05-invoice-types.md).
 */
export function ChaptersView(): JSX.Element {
  const { data, isPending, isError, refetch } = useBudgetCategories();

  if (isPending) return <LoadingState label="در حال بارگذاری فصل‌ها…" />;
  if (isError) {
    return <ErrorState message="دریافت فصل‌ها ناموفق بود" onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-6">
      {data.map((category) => (
        <section key={category.id} className="rounded-lg border border-border bg-card">
          <header className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold">{category.titleFa}</h3>
          </header>

          <ul className="divide-y divide-border">
            {category.chapters.map((chapter) => (
              <li key={chapter.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-40 font-medium">{chapter.title}</span>

                <span className="text-xs text-muted-foreground">
                  {chapter.code ? `کد: ${chapter.code}` : 'بدون کد'}
                </span>

                {!chapter.isActive ? (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    غیرفعال
                  </span>
                ) : null}

                <span className="text-muted-foreground" aria-hidden="true">
                  ←
                </span>

                <div className="flex flex-wrap gap-1.5">
                  {chapter.invoiceTypes.length === 0 ? (
                    <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                      هیچ نوع فاکتوری متصل نیست
                    </span>
                  ) : (
                    chapter.invoiceTypes.map((link) => (
                      <span
                        key={link.invoiceType.id}
                        className={
                          link.isDefault
                            ? 'rounded bg-primary/10 px-2 py-0.5 text-xs text-primary'
                            : 'rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                        }
                        title={INVOICE_KIND_LABELS[link.invoiceType.kind]}
                      >
                        {link.invoiceType.titleFa}
                        {link.isDefault ? ' (پیش‌فرض)' : ''}
                      </span>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
