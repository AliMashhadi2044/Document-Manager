import { useMemo, useState } from 'react';
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type Permission,
  type RoleKey,
} from '@dm/shared';

import { ApiError } from '../../shared/api/client';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { DataTable, type Column } from '../../shared/ui/data-table';
import { Icon } from '../../shared/ui/icon';
import { Input } from '../../shared/ui/input';
import { Segmented } from '../../shared/ui/segmented';
import { Select } from '../../shared/ui/select';
import { ErrorState } from '../../shared/ui/states';
import { useDebouncedValue } from '../../shared/hooks/use-debounced-value';
import { formatIsoAsJalali, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useCurrentUser } from '../auth/auth.api';
import { RowAction } from '../base-data/row-action';
import { PasswordDialog, UserDialog } from './user-dialog';
import {
  useRevokeSessions,
  useRoles,
  useSetRolePermissions,
  useUnlockUser,
  useUpdateUser,
  useUsersList,
  type RoleRow,
  type UserRow,
} from './users.api';

/**
 * مدیریت کاربران و دسترسی نقش‌ها.
 *
 * دو بخش، چون دو کار جدا‌اند: **کاربران** (کی وارد می‌شود و با چه نقشی) و
 * **نقش‌ها** (هر نقش چه می‌تواند). جدا نگه داشتنشان یعنی کسی که می‌خواهد یک
 * کارپرداز تازه بسازد، اتفاقی معنای نقش کارپردازی را برای همه عوض نمی‌کند.
 *
 * هیچ‌کدام از این دکمه‌ها کنترل دسترسی نیستند: هر مسیر سمت سرور مجوزش را خودش
 * بررسی می‌کند. پنهان کردن دکمه فقط برای این است که کاربر دنبال کاری نرود که
 * نتیجه‌اش خطا است.
 */
export function UsersPage(): JSX.Element {
  const [tab, setTab] = useState<'users' | 'roles'>('users');

  const { data: me } = useCurrentUser();
  const canWrite = me?.permissions.includes('user:write') ?? false;
  const canEditRoles = me?.permissions.includes('role:write') ?? false;

  return (
    <div className="space-y-4">
      <Segmented
        label="بخش"
        value={tab}
        onChange={(next) => setTab(next as 'users' | 'roles')}
        options={[
          { value: 'users', label: 'کاربران', icon: 'users' },
          { value: 'roles', label: 'نقش‌ها و دسترسی‌ها', icon: 'settings' },
        ]}
      />

      {tab === 'users' ? (
        <UsersTab canWrite={canWrite} currentUserId={me?.id ?? null} />
      ) : (
        <RolesTab canEdit={canEditRoles} />
      )}
    </div>
  );
}

// ───────────────────────────── کاربران ─────────────────────────────

function UsersTab({
  canWrite,
  currentUserId,
}: {
  canWrite: boolean;
  currentUserId: string | null;
}): JSX.Element {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const list = useUsersList(page, debouncedSearch, status);
  const update = useUpdateUser();
  const unlock = useUnlockUser();
  const revoke = useRevokeSessions();

  const act = (action: Promise<unknown>, done: string): void => {
    setMessage(null);
    void action.then(
      () => setMessage(done),
      (error: unknown) =>
        setMessage(error instanceof ApiError ? formatServerMessage(error.message) : 'انجام نشد'),
    );
  };

  const columns: Column<UserRow>[] = [
    {
      key: 'username',
      header: 'کاربر',
      sortKey: 'username',
      cell: (row) => (
        <div className="max-w-[28ch]">
          <div className="truncate font-medium" title={row.fullName}>
            {row.fullName}
          </div>
          <div className="truncate text-xs text-muted-foreground" dir="ltr">
            {row.username}
          </div>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'نقش‌ها',
      width: '16rem',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.roles.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : null}
          {row.roles.map((role) => (
            <Badge key={role} tone="info">
              {ROLE_LABELS[role]}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'آخرین ورود',
      width: '8rem',
      sortKey: 'lastLoginAt',
      cell: (row) => (
        <span className="money text-xs">
          {row.lastLoginAt ? formatIsoAsJalali(row.lastLoginAt) : 'هرگز'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      align: 'center',
      width: '8rem',
      cell: (row) => (
        <div className="flex flex-col items-center gap-1">
          <Badge tone={row.isActive ? 'success' : 'neutral'} dot>
            {row.isActive ? 'فعال' : 'غیرفعال'}
          </Badge>
          {/*
            قفل، وضعیتی جدا از «غیرفعال» است و باید جدا دیده شود: حساب فعالی که
            پس از چند رمز غلط قفل شده، خودش بعد از مدتی باز می‌شود — ولی کاربری
            که همین حالا پشت در مانده، نمی‌داند چرا.
          */}
          {row.isLocked ? <Badge tone="warning">قفل موقت</Badge> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'اقدام',
      align: 'end',
      width: '10rem',
      cell: (row) =>
        canWrite ? (
          <div className="flex items-center justify-end gap-0.5">
            <RowAction icon="edit" label={`اصلاح ${row.username}`} onClick={() => setEditing(row)} />
            <RowAction
              icon="restore"
              label={`بازنشانی رمز ${row.username}`}
              onClick={() => setResetting(row)}
            />
            {row.isLocked ? (
              <RowAction
                icon="check"
                label={`باز کردن قفل ${row.username}`}
                onClick={() => act(unlock.mutateAsync(row.id), 'قفل حساب باز شد.')}
              />
            ) : null}
            <RowAction
              icon="logout"
              label={`بستن نشست‌های ${row.username}`}
              onClick={() => {
                if (!window.confirm(`همهٔ نشست‌های «${row.username}» بسته شود؟`)) return;
                act(revoke.mutateAsync(row.id), 'نشست‌های این کاربر بسته شد.');
              }}
            />
            {/*
              حساب خودِ بیننده دکمهٔ غیرفعال‌سازی ندارد — و سرور هم ردش می‌کند.
              کسی که خودش را غیرفعال کند، همان لحظه بیرون می‌افتد و راه برگشتی
              جز خط فرمان سرور ندارد.
            */}
            {row.id === currentUserId ? null : (
              <RowAction
                icon="power"
                danger={row.isActive}
                label={`${row.isActive ? 'غیرفعال کردن' : 'فعال کردن'} ${row.username}`}
                onClick={() =>
                  act(
                    update.mutateAsync({ id: row.id, isActive: !row.isActive }),
                    row.isActive
                      ? 'کاربر غیرفعال شد و نشست‌هایش بسته شد.'
                      : 'کاربر فعال شد.',
                  )
                }
              />
            )}
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      {message ? (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={list.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={list.isPending}
        error={list.isError ? 'دریافت فهرست کاربران ناموفق بود' : undefined}
        onRetry={() => void list.refetch()}
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
        emptyTitle="کاربری پیدا نشد"
        emptyDescription="کاربر تازه بسازید و نقشش را انتخاب کنید."
        emptyAction={
          canWrite ? <Button onClick={() => setEditing('new')}>کاربر تازه</Button> : undefined
        }
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
                placeholder="نام یا نام کاربری"
              />
            </div>

            <div className="w-36">
              <Select
                label="وضعیت"
                prefsKey={null}
                placeholder="همه"
                value={status}
                onChange={(nextValue) => {
                  setStatus(nextValue);
                  setPage(1);
                }}
                options={[
                  { value: 'true', label: 'فعال' },
                  { value: 'false', label: 'غیرفعال' },
                ]}
              />
            </div>

            {canWrite ? (
              <Button onClick={() => setEditing('new')}>
                <Icon name="plus" size={16} />
                کاربر تازه
              </Button>
            ) : null}
          </div>
        }
      />

      <p className="text-[11px] leading-5 text-muted-foreground">
        کاربر **حذف** نمی‌شود، غیرفعال می‌شود: نام او پای اسناد، فاکتورها و ردیف‌های
        حسابرسی نشسته است و حذفش آن ردپا را می‌شکست. کاربر غیرفعال نه وارد می‌شود و
        نه نشست بازش کار می‌کند.
      </p>

      {editing !== null ? (
        <UserDialog
          user={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.id === currentUserId}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMessage(text);
          }}
        />
      ) : null}

      {resetting ? (
        <PasswordDialog
          user={resetting}
          onClose={() => setResetting(null)}
          onSaved={(text) => {
            setResetting(null);
            setMessage(text);
          }}
        />
      ) : null}
    </div>
  );
}

// ──────────────────────── نقش‌ها و دسترسی‌ها ────────────────────────

/** گروه مجوز از پیشوند کلیدش می‌آید — همان گروهی که سرور هم با آن ذخیره می‌کند. */
const PERMISSION_GROUPS: readonly { readonly key: string; readonly titleFa: string }[] = [
  { key: 'document', titleFa: 'اسناد' },
  { key: 'invoice', titleFa: 'فاکتورها' },
  { key: 'vendor', titleFa: 'فروشندگان' },
  { key: 'vendor_bank_account', titleFa: 'حساب فروشنده' },
  { key: 'buyer', titleFa: 'مجموعه‌های خریدار' },
  { key: 'base_data', titleFa: 'اطلاعات پایه' },
  { key: 'financial_settings', titleFa: 'تنظیمات مالی' },
  { key: 'archive', titleFa: 'بایگانی' },
  { key: 'attachment', titleFa: 'فایل‌ها' },
  { key: 'feedback', titleFa: 'بازخورد' },
  { key: 'report', titleFa: 'گزارش‌گیری' },
  { key: 'report_template', titleFa: 'قالب گزارش' },
  { key: 'user', titleFa: 'کاربران' },
  { key: 'role', titleFa: 'نقش‌ها' },
  { key: 'audit', titleFa: 'حسابرسی' },
];

function groupOf(permission: Permission): string {
  const prefix = permission.split(':')[0] ?? '';
  return PERMISSION_GROUPS.some((group) => group.key === prefix) ? prefix : 'document';
}

function RolesTab({ canEdit }: { canEdit: boolean }): JSX.Element {
  const roles = useRoles();
  const [selected, setSelected] = useState<RoleKey | null>(null);

  if (roles.isError) {
    return (
      <ErrorState
        title="خواندن نقش‌ها ناموفق بود"
        message={
          roles.error instanceof ApiError
            ? formatServerMessage(roles.error.message)
            : 'خطای نامشخص'
        }
        onRetry={() => void roles.refetch()}
      />
    );
  }

  const list = roles.data ?? [];
  const current = list.find((role) => role.key === (selected ?? list[0]?.key)) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {list.map((role) => (
          <button
            key={role.key}
            type="button"
            aria-pressed={role.key === current?.key}
            onClick={() => setSelected(role.key)}
            className={
              role.key === current?.key
                ? 'rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary'
                : 'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted'
            }
          >
            {role.titleFa}
            <span className="ms-2 text-[11px] opacity-70">
              {toPersianDigits(String(role.userCount))} کاربر
            </span>
          </button>
        ))}
      </div>

      {current ? <RoleEditor key={current.key} role={current} canEdit={canEdit} /> : null}
    </div>
  );
}

function RoleEditor({ role, canEdit }: { role: RoleRow; canEdit: boolean }): JSX.Element {
  const save = useSetRolePermissions();
  const [picked, setPicked] = useState<readonly Permission[]>(role.permissions);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => {
    const before = [...role.permissions].sort().join(',');
    const after = [...picked].sort().join(',');
    return before !== after;
  }, [picked, role.permissions]);

  const toggle = (permission: Permission): void => {
    setMessage(null);
    setPicked((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">دسترسی‌های نقش «{role.titleFa}»</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            فهرست مجوزها در کد است تا بازبینی‌شدنی باشد، ولی **تخصیصش** داده است و از
            همین‌جا عوض می‌شود. تغییر، اثر فوری دارد: نشست هر کاربر در هر درخواست
            دسترسی‌هایش را تازه می‌خواند.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <span className="text-xs text-muted-foreground">
              {toPersianDigits(String(picked.length))} از{' '}
              {toPersianDigits(String(PERMISSIONS.length))} — ذخیره نشده
            </span>
          ) : null}
          {canEdit ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={!dirty}
                onClick={() => setPicked(role.permissions)}
              >
                بازگشت
              </Button>
              <Button
                size="sm"
                loading={save.isPending}
                disabled={!dirty}
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  save.mutate(
                    { key: role.key, permissions: picked },
                    {
                      onSuccess: () => setMessage('دسترسی‌های این نقش ذخیره شد.'),
                      onError: (caught) =>
                        setError(
                          caught instanceof ApiError
                            ? formatServerMessage(caught.message)
                            : 'ذخیره ناموفق بود',
                        ),
                    },
                  );
                }}
              >
                ذخیره دسترسی‌ها
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {message ? (
        <p role="status" className="rounded-md bg-primary/10 p-2.5 text-sm text-primary">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {PERMISSION_GROUPS.map((group) => {
          const members = PERMISSIONS.filter((permission) => groupOf(permission) === group.key);
          if (members.length === 0) return null;
          const allPicked = members.every((permission) => picked.includes(permission));

          return (
            <fieldset key={group.key} className="rounded-md border border-border p-3">
              <legend className="flex items-center gap-2 px-1 text-xs font-medium">
                {group.titleFa}
                {canEdit ? (
                  <button
                    type="button"
                    className="text-[11px] text-primary hover:underline"
                    onClick={() =>
                      setPicked((current) =>
                        allPicked
                          ? current.filter((permission) => !members.includes(permission))
                          : [...new Set([...current, ...members])],
                      )
                    }
                  >
                    {allPicked ? 'هیچ‌کدام' : 'همه'}
                  </button>
                ) : null}
              </legend>

              <ul className="space-y-1">
                {members.map((permission) => (
                  <li key={permission}>
                    <label className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={picked.includes(permission)}
                        disabled={!canEdit}
                        onChange={() => toggle(permission)}
                      />
                      <span className="min-w-0">
                        {PERMISSION_LABELS[permission]}
                        <span className="ms-1 text-[10px] text-muted-foreground" dir="ltr">
                          {permission}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        })}
      </div>

      <p className="text-[11px] leading-5 text-muted-foreground">
        یک مرز سمت سرور هست که از اینجا دیده نمی‌شود: تغییری که سامانه را بی‌هیچ کاربر
        فعالِ دارای «مدیریت کاربران» بگذارد، رد می‌شود — وگرنه راهی برای برگشتن جز خط
        فرمان سرور نمی‌ماند.
      </p>
    </section>
  );
}
