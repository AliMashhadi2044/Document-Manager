import { formatIsoAsJalali, toPersianDigits } from '../../shared/format/money';
import { exportDownloadUrl, type ExportJobDto } from './analytics.api';

const STATUS_LABELS: Record<ExportJobDto['status'], string> = {
  PENDING: 'در صف',
  RUNNING: 'در حال ساخت',
  SUCCEEDED: 'آماده',
  FAILED: 'ناموفق',
  EXPIRED: 'منقضی‌شده',
};

/**
 * خروجی‌های من — کارهای صف‌شده و وضعیتشان.
 *
 * لینک دانلود یک مسیر GET است که سرور سه چیز را بررسی می‌کند: کار از خودِ کاربر
 * باشد، موفق شده باشد، و منقضی نشده باشد. پس «لینک» به‌تنهایی چیزی باز نمی‌کند و
 * اینجا هم چیزی جز شناسه کار نگه داشته نمی‌شود.
 */
export function ExportJobs({ jobs }: { jobs: readonly ExportJobDto[] }): JSX.Element | null {
  if (jobs.length === 0) return null;

  return (
    <section className="space-y-2 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">خروجی‌های من</h3>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-2 py-1.5 text-start">گزارش</th>
              <th className="px-2 py-1.5 text-start">زمان درخواست</th>
              <th className="px-2 py-1.5 text-start">وضعیت</th>
              <th className="px-2 py-1.5 text-start">ردیف</th>
              <th className="px-2 py-1.5 text-start">مهلت دانلود</th>
              <th className="px-2 py-1.5 text-start">اقدام</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-border">
                <td className="px-2 py-1.5">{job.datasetKey}</td>
                <td className="px-2 py-1.5">{formatIsoAsJalali(job.createdAt)}</td>
                <td className="px-2 py-1.5">
                  {STATUS_LABELS[job.status]}
                  {job.errorMessage ? (
                    <span className="block text-[11px] text-destructive">{job.errorMessage}</span>
                  ) : null}
                </td>
                <td className="px-2 py-1.5">
                  {job.rowCount === null ? '—' : toPersianDigits(String(job.rowCount))}
                </td>
                <td className="px-2 py-1.5">
                  {job.expiresAt === null ? '—' : formatIsoAsJalali(job.expiresAt)}
                </td>
                <td className="px-2 py-1.5">
                  {job.status === 'SUCCEEDED' ? (
                    <a
                      href={exportDownloadUrl(job.id)}
                      className="text-primary hover:underline"
                      download
                    >
                      دانلود
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-5 text-muted-foreground">
        فایل خروجی پس از پایان مهلت، از فضای ذخیره‌سازی پاک می‌شود و ردیفش با
        وضعیت «منقضی‌شده» در این فهرست می‌ماند.
      </p>
    </section>
  );
}
