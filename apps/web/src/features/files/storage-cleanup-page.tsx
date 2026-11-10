import { useState } from 'react';

import { ApiError } from '../../shared/api/client';
import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { Input } from '../../shared/ui/input';
import { EmptyState } from '../../shared/ui/states';
import { formatIsoAsJalali, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { formatFileSize } from '../../shared/format/bytes';
import { useOrphanScan, usePurgeOrphans } from './storage-cleanup.api';

/**
 * پاک‌سازی فایل‌های بی‌سند.
 *
 * ذخیره‌سازی و پایگاه داده همیشه دقیقاً یکی نمی‌مانند: آپلودی که نیمه‌کاره قطع شد،
 * سندی که برای همیشه پاک شد و شیءهایش جا ماندند، پشتیبانی که به دیروز برگشت. هیچ
 * کدام خطای کاربر نیستند و هیچ‌کدام خودبه‌خود درست نمی‌شوند؛ فقط فضا را پر می‌کنند
 * و کسی نمی‌داند چرا.
 *
 * دو تصمیم رابط که عمدی‌اند:
 *
 *  ۱. **پیمایش با دکمه شروع می‌شود، نه با باز شدن صفحه.** هر پیمایش، فهرست کردن کل
 *     bucket است؛ صفحه‌ای که با هر بازدید این کار را بکند، روی سازمانی با صدها هزار
 *     فایل یک ابزار خودآزار است.
 *
 *  ۲. **هیچ چیز پیش‌فرض تیک‌خورده نیست.** «همه را انتخاب کن» هست، ولی کاربر باید
 *     خودش بزند. و عبارت تأیید تایپ می‌شود، مثل حذف دائمی سند.
 */
export function StorageCleanupPage(): JSX.Element {
  const [started, setStarted] = useState(false);
  const scan = useOrphanScan(started);
  const purge = usePurgeOrphans();

  const [selectedKeys, setSelectedKeys] = useState<readonly string[]>([]);
  const [selectedRecords, setSelectedRecords] = useState<readonly string[]>([]);
  const [confirmText, setConfirmText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const data = scan.data;
  const selectedCount = selectedKeys.length + selectedRecords.length;

  const selectedBytes = (data?.objects ?? [])
    .filter((object) => selectedKeys.includes(object.key))
    .reduce((sum, object) => sum + Number(object.sizeBytes), 0);

  function toggle<T>(list: readonly T[], value: T): readonly T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function reset(): void {
    setSelectedKeys([]);
    setSelectedRecords([]);
    setConfirming(false);
    setConfirmText('');
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-sm font-semibold">فایل‌هایی که به هیچ سندی وصل نیستند</h3>
        <p className="mt-2 max-w-3xl text-xs leading-6 text-muted-foreground">
          این صفحه فضای ذخیره‌سازی را با پایگاه داده مقایسه می‌کند و دو چیز را نشان
          می‌دهد: فایل‌هایی که هیچ پیوستی سراغشان را نمی‌گیرد، و ردیف‌های آپلودِ
          نیمه‌کاره‌ای که هیچ‌وقت فایلی نداشتند. فایلِ <span className="font-medium">حذف‌شده</span>{' '}
          اینجا نمی‌آید — آن هنوز صاحب دارد و از برگهٔ همان سند قابل بازگرداندن است.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            loading={scan.isFetching}
            onClick={() => {
              setNotice(null);
              setError(null);
              reset();
              if (started) void scan.refetch();
              else setStarted(true);
            }}
          >
            <Icon name="search" size={15} />
            {started ? 'پیمایش دوباره' : 'شروع پیمایش'}
          </Button>

          {data ? (
            <p className="text-xs text-muted-foreground">
              {toPersianDigits(String(data.scanned))} شیء بررسی شد · آستانهٔ سن:{' '}
              {toPersianDigits(String(data.graceHours))} ساعت
            </p>
          ) : null}
        </div>

        {data?.truncated ? (
          <p className="mt-3 rounded-md bg-warning/10 p-3 text-xs text-warning">
            پیمایش به سقف خود رسید و همهٔ فایل‌ها بررسی نشدند. پس از پاک کردن این دسته،
            دوباره پیمایش کنید.
          </p>
        ) : null}
      </section>

      {scan.isError ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          پیمایش ناموفق بود؛ اگر فضای ذخیره‌سازی پیکربندی نشده باشد، این صفحه کاری
          نمی‌تواند بکند.
        </p>
      ) : null}

      {data ? (
        <>
          <section className="rounded-lg border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">
                فایل‌های بی‌صاحب در ذخیره‌سازی ({toPersianDigits(String(data.objects.length))})
              </h4>
              {data.objects.length > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setSelectedKeys(
                      selectedKeys.length === data.objects.length
                        ? []
                        : data.objects.map((object) => object.key),
                    )
                  }
                >
                  {selectedKeys.length === data.objects.length ? 'برداشتن همه' : 'انتخاب همه'}
                </Button>
              ) : null}
            </div>

            {data.objects.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="فایل بی‌صاحبی پیدا نشد"
                  description="هر فایلی که در ذخیره‌سازی هست، یک پیوست آن را می‌شناسد."
                />
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {data.objects.map((object) => (
                  <li key={object.key} className="flex items-center gap-3 py-2.5">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={selectedKeys.includes(object.key)}
                      onChange={() => setSelectedKeys((previous) => toggle(previous, object.key))}
                      aria-label={`انتخاب ${object.key}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p dir="ltr" className="truncate text-left font-mono text-xs">
                        {object.key}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatFileSize(object.sizeBytes)} · آخرین تغییر{' '}
                        {formatIsoAsJalali(object.lastModified)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <h4 className="text-sm font-semibold">
              ردیف‌های آپلود نیمه‌کاره ({toPersianDigits(String(data.staleRecords.length))})
            </h4>
            <p className="mt-1.5 text-xs text-muted-foreground">
              آپلودی که شروع شد و تمام نشد. این ردیف‌ها در هیچ فهرستی دیده نمی‌شوند و
              فایلی هم ندارند.
            </p>

            {data.staleRecords.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="ردیف نیمه‌کاره‌ای نیست" description="" />
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {data.staleRecords.map((record) => (
                  <li key={record.id} className="flex items-center gap-3 py-2.5">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={selectedRecords.includes(record.id)}
                      onChange={() =>
                        setSelectedRecords((previous) => toggle(previous, record.id))
                      }
                      aria-label={`انتخاب ${record.originalFilename}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{record.originalFilename}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatFileSize(record.sizeBytes)} · {formatIsoAsJalali(record.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selectedCount > 0 ? (
            <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-6">
              <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <Icon name="alert" size={16} />
                {toPersianDigits(String(selectedCount))} قلم انتخاب شده است
                {selectedBytes > 0 ? ` · ${formatFileSize(String(selectedBytes))}` : ''}
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-destructive/90">
                <li>این فایل‌ها از فضای ذخیره‌سازی پاک می‌شوند و برنمی‌گردند.</li>
                <li>
                  اگر مطمئن نیستید، ابتدا از bucket پشتیبان بگیرید؛ این صفحه نسخهٔ پشتیبان
                  نمی‌سازد.
                </li>
                <li>یک ردیف حسابرسی با فهرست کلیدهای پاک‌شده ثبت می‌شود.</li>
              </ul>

              {confirming ? (
                <div className="mt-3 space-y-2">
                  <Input
                    label="برای تأیید، عبارت «حذف دائمی» را بنویسید"
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="destructive"
                      loading={purge.isPending}
                      disabled={confirmText.trim() !== 'حذف دائمی'}
                      onClick={() => {
                        setNotice(null);
                        setError(null);
                        purge.mutate(
                          { keys: selectedKeys, recordIds: selectedRecords },
                          {
                            onSuccess: (result) => {
                              setNotice(
                                `${toPersianDigits(String(result.removedObjects))} فایل و ${toPersianDigits(
                                  String(result.removedRecords),
                                )} ردیف نیمه‌کاره پاک شد.${
                                  result.skipped.length > 0
                                    ? ` ${toPersianDigits(String(result.skipped.length))} قلم رد شد.`
                                    : ''
                                }`,
                              );
                              reset();
                            },
                            onError: (caught) =>
                              setError(
                                caught instanceof ApiError
                                  ? formatServerMessage(caught.message)
                                  : 'پاک‌سازی ناموفق بود',
                              ),
                          },
                        );
                      }}
                    >
                      بله، برای همیشه پاک کن
                    </Button>
                    <Button variant="ghost" onClick={reset}>
                      انصراف
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <Button variant="destructive" onClick={() => setConfirming(true)}>
                    <Icon name="trash" size={15} />
                    پاک کردن انتخاب‌شده‌ها
                  </Button>
                </div>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {notice ? (
        <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {purge.data && purge.data.skipped.length > 0 ? (
        <section className="rounded-lg border border-border p-4">
          <p className="text-xs font-medium">قلم‌هایی که پاک نشدند، و دلیلشان</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {purge.data.skipped.map((line) => (
              <li key={line} dir="auto">
                {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

