import { useState } from 'react';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { DataTable, type Column } from '../../shared/ui/data-table';
import { ApiError } from '../../shared/api/client';
import {
  useCreateLookup,
  useDeleteLookup,
  useLookupList,
  useLookupResources,
  useReorderLookup,
  useUpdateLookup,
  type LookupItem,
  type LookupListParams,
} from './base-data.api';

/**
 * مدیریت فهرست‌های ساده اطلاعات پایه.
 *
 * همه حالت‌ها پوشش داده شده‌اند: بارگذاری، خطای شبکه، خطای اعتبارسنجی، نبود داده و
 * موفقیت عملیات (الزام §۵ و §۳۶ پرامپت).
 */
export function LookupManager(): JSX.Element {
  const { data: resources, isPending: resourcesLoading } = useLookupResources();
  const [resource, setResource] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [newTitle, setNewTitle] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const activeResource = resource || resources?.[0]?.key || '';

  const listParams: LookupListParams = {
    resource: activeResource,
    page,
    search,
    isActive: onlyActive ? 'true' : undefined,
    sortBy,
    sortDir,
  };

  const list = useLookupList(listParams);
  const reorder = useReorderLookup(activeResource, listParams);

  /**
   * جابه‌جایی فقط وقتی معنا دارد که آنچه دیده می‌شود همان ترتیبِ ذخیره‌شده باشد.
   *
   * با مرتب‌سازی روی ستونی دیگر یا فیلتر جست‌وجو، ردیف‌های بینابینی از قلم می‌افتند و
   * «ببر بالای این یکی» دیگر معنای روشنی ندارد — پس دستگیره خاموش می‌شود و دلیلش گفته می‌شود.
   */
  const reorderBlockedReason =
    search !== ''
      ? 'برای جابه‌جایی ترتیب، جست‌وجو را خالی کنید.'
      : sortBy !== undefined && sortBy !== 'sortOrder'
        ? 'برای جابه‌جایی ترتیب، مرتب‌سازی را روی ستون «ترتیب» بگذارید.'
        : sortDir === 'desc'
          ? 'برای جابه‌جایی ترتیب، مرتب‌سازی صعودی لازم است.'
          : undefined;

  const create = useCreateLookup(activeResource);
  const update = useUpdateLookup(activeResource);
  const remove = useDeleteLookup(activeResource);

  function report(error: unknown): void {
    setMessage({
      kind: 'error',
      text: error instanceof ApiError ? error.message : 'خطا در ارتباط با سرور',
    });
  }

  const columns: Column<LookupItem>[] = [
    { key: 'title', header: 'عنوان', sortKey: 'title', cell: (row) => row.title },
    {
      key: 'sortOrder',
      header: 'ترتیب',
      sortKey: 'sortOrder',
      align: 'center',
      width: '6rem',
      cell: (row) => row.sortOrder.toLocaleString('fa-IR'),
    },
    {
      key: 'usage',
      header: 'رکوردهای مرتبط',
      align: 'center',
      width: '9rem',
      cell: (row) => row.usageCount.toLocaleString('fa-IR'),
    },
    {
      /*
        پیش‌فرض.

        یک دکمهٔ ستاره‌مانند و نه یک تیک در فرم ویرایش: کاربر پیش‌فرض را در همین
        فهرست و در مقایسه با بقیه انتخاب می‌کند، نه در یک پنجرهٔ جدا.
      */
      key: 'default',
      header: 'پیش‌فرض',
      align: 'center',
      width: '7rem',
      cell: (row) => (
        <Button
          size="sm"
          variant={row.isDefault ? 'secondary' : 'ghost'}
          disabled={!row.isActive && !row.isDefault}
          aria-pressed={row.isDefault}
          title={
            row.isActive
              ? row.isDefault
                ? 'پیش‌فرض است؛ برای برداشتن دوباره بزنید'
                : 'این مورد پیش‌فرض شود'
              : 'مورد غیرفعال نمی‌تواند پیش‌فرض باشد'
          }
          onClick={() => {
            setMessage(null);
            update.mutate(
              { id: row.id, isDefault: !row.isDefault },
              {
                onSuccess: () =>
                  setMessage({
                    kind: 'success',
                    text: row.isDefault ? 'پیش‌فرض برداشته شد' : `«${row.title}» پیش‌فرض شد`,
                  }),
                onError: report,
              },
            );
          }}
        >
          {row.isDefault ? '★ پیش‌فرض' : '☆'}
        </Button>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      align: 'center',
      width: '7rem',
      cell: (row) => (
        <span
          className={
            row.isActive
              ? 'rounded bg-success/10 px-2 py-0.5 text-xs text-success'
              : 'rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground'
          }
        >
          {row.isActive ? 'فعال' : 'غیرفعال'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'اقدام',
      align: 'end',
      width: '14rem',
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setMessage(null);
              update.mutate(
                { id: row.id, isActive: !row.isActive },
                {
                  onSuccess: () =>
                    setMessage({
                      kind: 'success',
                      text: row.isActive ? 'مورد غیرفعال شد' : 'مورد فعال شد',
                    }),
                  onError: report,
                },
              );
            }}
          >
            {row.isActive ? 'غیرفعال' : 'فعال'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              setMessage(null);
              remove.mutate(row.id, {
                onSuccess: () => setMessage({ kind: 'success', text: 'مورد حذف شد' }),
                onError: report,
              });
            }}
          >
            حذف
          </Button>
        </div>
      ),
    },
  ];

  if (resourcesLoading) {
    return <p className="text-sm text-muted-foreground">در حال بارگذاری منابع…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {resources?.map((item) => (
          <Button
            key={item.key}
            size="sm"
            variant={activeResource === item.key ? 'primary' : 'secondary'}
            aria-pressed={activeResource === item.key}
            onClick={() => {
              setResource(item.key);
              setPage(1);
              setMessage(null);
            }}
          >
            {item.titleFa}
          </Button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newTitle.trim()) return;
            setMessage(null);
            create.mutate(
              { title: newTitle.trim() },
              {
                onSuccess: () => {
                  setNewTitle('');
                  setMessage({ kind: 'success', text: 'مورد جدید افزوده شد' });
                },
                onError: report,
              },
            );
          }}
        >
          <div className="min-w-56 flex-1">
            <Input
              label="افزودن مورد جدید"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="عنوان"
            />
          </div>
          <Button type="submit" loading={create.isPending} disabled={!newTitle.trim()}>
            افزودن
          </Button>
        </form>
      </div>

      {message ? (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={
            message.kind === 'error'
              ? 'rounded-md bg-destructive/10 p-3 text-sm text-destructive'
              : 'rounded-md bg-success/10 p-3 text-sm text-success'
          }
        >
          {message.text}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={list.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={list.isPending}
        error={list.isError ? 'دریافت فهرست ناموفق بود' : undefined}
        onRetry={() => void list.refetch()}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortBy(key);
          setSortDir(dir);
        }}
        page={
          list.data
            ? {
                page: list.data.page,
                pageSize: list.data.pageSize,
                total: list.data.total,
                pageCount: list.data.pageCount,
              }
            : undefined
        }
        onPageChange={setPage}
        onReorder={(ids) => {
          setMessage(null);
          reorder.mutate(ids, {
            onError: report,
          });
        }}
        reorderBlockedReason={reorderBlockedReason}
        emptyTitle="موردی ثبت نشده است"
        emptyDescription="با فرم بالا اولین مورد را اضافه کنید."
        toolbar={
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Input
                label="جست‌وجو"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="بخشی از عنوان"
              />
            </div>
            <Button
              size="sm"
              variant={onlyActive ? 'primary' : 'secondary'}
              aria-pressed={onlyActive}
              onClick={() => {
                setOnlyActive((value) => !value);
                setPage(1);
              }}
            >
              فقط فعال‌ها
            </Button>
          </div>
        }
      />
    </div>
  );
}
