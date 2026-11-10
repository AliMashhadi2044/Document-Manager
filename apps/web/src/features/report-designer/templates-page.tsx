import { useState } from 'react';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Modal } from '../../shared/ui/modal';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import { formatIsoAsJalali, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import type { CurrentUser } from '../auth/auth.api';
import { Designer } from './designer';
import {
  useArchiveTemplate,
  useCopyTemplate,
  useEditableTemplate,
  useTemplateList,
  type TemplateListRow,
} from './templates.api';

/**
 * فهرست قالب‌های گزارش و درِ ورود به طراح.
 *
 * ستون «فعال» اینجا مهم‌تر از آن است که به نظر می‌رسد: اجرای یک نوع گزارش از **قالب
 * فعال** انجام می‌شود. تا پیش از فاز ۷، «کدام قالب اجرا می‌شود» به ترتیب ساخت ردیف‌ها
 * گره خورده بود و کاربری که قالب را کپی، ویرایش و منتشر می‌کرد، همان خروجی قدیمی را
 * می‌گرفت بی‌آنکه بفهمد چرا.
 */
export function ReportTemplatesPage({ user }: { user: CurrentUser }): JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);
  const [copying, setCopying] = useState<TemplateListRow | null>(null);

  if (openId !== null) {
    return <Designer definitionId={openId} user={user} onBack={() => setOpenId(null)} />;
  }

  return (
    <>
      <TemplatesList
        user={user}
        onOpen={setOpenId}
        onCopy={setCopying}
      />
      {copying ? (
        <CopyDialog
          source={copying}
          onClose={() => setCopying(null)}
          onCopied={(id) => {
            setCopying(null);
            setOpenId(id);
          }}
        />
      ) : null}
    </>
  );
}

function TemplatesList({
  user,
  onOpen,
  onCopy,
}: {
  user: CurrentUser;
  onOpen: (definitionId: string) => void;
  onCopy: (row: TemplateListRow) => void;
}): JSX.Element {
  const [includeArchived, setIncludeArchived] = useState(false);
  const list = useTemplateList(includeArchived);
  const archive = useArchiveTemplate();
  const editable = useEditableTemplate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const canWrite = user.permissions.includes('report_template:write');

  if (list.isPending) return <LoadingState label="در حال خواندن قالب‌ها…" />;
  if (list.isError) {
    return (
      <ErrorState
        title="خواندن قالب‌ها ناموفق بود"
        message={
          list.error instanceof ApiError ? formatServerMessage(list.error.message) : 'خطای نامشخص'
        }
        onRetry={() => void list.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">قالب‌های گزارش</h2>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          قالب گزارش یک سند داده است، نه کد: ستون‌ها، قالب اعداد، ردیف جمع و امضاها همه
          در همین طراح تنظیم می‌شوند و خروجی چاپ، Excel و PDF از همان ساخته می‌شود.
          «ویرایش» را بزنید؛ اگر قالب سیستمی باشد، خودش یک نسخهٔ سازمانیِ قابل ویرایش
          می‌سازد تا قالب سیستمی همیشه یک مرجع بازگشت سالم بماند. تغییرها با «انتشار و
          اعمال» در خروجی‌ها می‌نشینند.
        </p>

        <label className="mt-3 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />
          نمایش قالب‌های بایگانی‌شده
        </label>
      </section>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr className="text-xs text-muted-foreground">
              <th className="px-3 py-2 text-start">نام قالب</th>
              <th className="px-3 py-2 text-start">نوع گزارش</th>
              <th className="px-3 py-2 text-start">وضعیت</th>
              <th className="px-3 py-2 text-start">نسخه جاری</th>
              <th className="px-3 py-2 text-start">نسخه‌ها</th>
              <th className="px-3 py-2 text-start">اجراها</th>
              <th className="px-3 py-2 text-start">آخرین تغییر</th>
              <th className="px-3 py-2 text-start">اقدام</th>
            </tr>
          </thead>
          <tbody>
            {list.data.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  هیچ قالبی ثبت نشده است.
                </td>
              </tr>
            ) : null}

            {list.data.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <span className="block truncate font-medium">{row.name}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {row.isSystem ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        سیستمی
                      </span>
                    ) : null}
                    {row.isActive ? (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                        قالب فعال
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">{row.reportType.titleFa}</td>
                <td className="px-3 py-2 text-xs">
                  {row.status === 'PUBLISHED'
                    ? 'منتشرشده'
                    : row.status === 'DRAFT'
                      ? 'پیش‌نویس'
                      : 'بایگانی‌شده'}
                </td>
                <td className="px-3 py-2 text-xs">
                  {row.currentVersion
                    ? toPersianDigits(String(row.currentVersion.versionNo))
                    : '—'}
                </td>
                <td className="px-3 py-2 text-xs">{toPersianDigits(String(row.versionCount))}</td>
                <td className="px-3 py-2 text-xs">{toPersianDigits(String(row.runCount))}</td>
                <td className="px-3 py-2 text-xs">{formatIsoAsJalali(row.updatedAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {/*
                      «ویرایش» یک دکمه است، نه یک رویه.

                      قاعدهٔ «قالب سیستمی ویرایش نمی‌شود» سر جایش است؛ ولی تا
                      امروز اجرایش به عهدهٔ کاربر بود: باید می‌فهمید کپی لازم
                      است، کپی می‌گرفت، اسم می‌گذاشت، و بعد کپی را پیدا می‌کرد.
                      حالا سرور تصمیم می‌گیرد و کاربر مستقیم در طراح می‌نشیند.
                    */}
                    {canWrite ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={editable.isPending && editingId === row.id}
                        onClick={() => {
                          setEditingId(row.id);
                          editable.mutate(row.id, {
                            onSuccess: (result) => onOpen(result.definitionId),
                          });
                        }}
                      >
                        ویرایش
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => onOpen(row.id)}>
                      مشاهده
                    </Button>
                    {canWrite ? (
                      <Button size="sm" variant="ghost" onClick={() => onCopy(row)}>
                        کپی تازه
                      </Button>
                    ) : null}
                    {canWrite && !row.isSystem && !row.isActive && row.status !== 'ARCHIVED' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={archive.isPending}
                        onClick={() => archive.mutate({ definitionId: row.id })}
                      >
                        بایگانی
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CopyDialog({
  source,
  onClose,
  onCopied,
}: {
  source: TemplateListRow;
  onClose: () => void;
  onCopied: (definitionId: string) => void;
}): JSX.Element {
  const [name, setName] = useState(`${source.name} — کپی`);
  const [error, setError] = useState<string | null>(null);
  const copy = useCopyTemplate();

  return (
    <Modal title={`کپی از «${source.name}»`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs leading-6 text-muted-foreground">
          کپی به‌صورت پیش‌نویس ساخته می‌شود و هیچ خروجی‌ای از آن تولید نمی‌شود تا منتشر و
          فعال شود. قالب اصلی دست‌نخورده می‌ماند.
        </p>

        <Input
          label="نام قالب تازه"
          required
          value={name}
          maxLength={200}
          onChange={(event) => setName(event.target.value)}
        />

        {error ? <ErrorState message={error} /> : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            انصراف
          </Button>
          <Button
            size="sm"
            loading={copy.isPending}
            disabled={name.trim() === ''}
            onClick={() =>
              copy.mutate(
                { definitionId: source.id, name: name.trim() },
                {
                  onSuccess: (result) => onCopied(result.id),
                  onError: (caught) =>
                    setError(
                      caught instanceof ApiError
                        ? formatServerMessage(caught.message)
                        : 'کپی ناموفق بود',
                    ),
                },
              )
            }
          >
            ساخت کپی
          </Button>
        </div>
      </div>
    </Modal>
  );
}
