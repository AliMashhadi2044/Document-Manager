import { useEffect, useMemo, useState } from 'react';
import { templateV1Schema, type Block, type TemplateV1 } from '@dm/report-engine';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import { formatIsoAsJalali, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import type { CurrentUser } from '../auth/auth.api';
import { Canvas, PageSettings } from './canvas';
import { BlockSettings } from './block-settings';
import { DataDictionaryPanel } from './data-dictionary-panel';
import { DesignerPreview } from './designer-preview';
import {
  bandBlocks,
  setBandBlocks,
  templateProblems,
  type Band,
} from './template-ops';
import {
  problemsOf,
  useActivateTemplate,
  useCheckTemplate,
  useDataSources,
  usePublishVersion,
  useRenameTemplate,
  useSaveDraft,
  useSignatories,
  useTemplateDetail,
  useTemplateVersion,
} from './templates.api';

type Tab = 'structure' | 'preview';

/**
 * طراح قالب گزارش.
 *
 * سه قاعده‌ای که کل این صفحه حولشان ساخته شده:
 *
 *  ۱. **نسخه منتشرشده ویرایش نمی‌شود.** باز کردن نسخه منتشرشده، فقط خواندنی است؛
 *     «ویرایش» یک نسخه پیش‌نویس تازه می‌سازد. بدون این قاعده، ویرایش یک قالب،
 *     خروجی‌های تاریخیِ بسته به آن را بی‌صدا عوض می‌کرد.
 *
 *  ۲. **اعتبارسنجی همان تابع موتور است.** مرورگر همان `validateTemplate` را اجرا
 *     می‌کند که سرور — بسته ایزومورفیک برای همین ساخته شد. ولی **مرجع سرور است**: دکمه
 *     ذخیره پیش از نوشتن، اعتبارسنجی سرور را هم می‌گیرد.
 *
 *  ۳. **قالب از بدنه درخواست اجرا نمی‌شود.** پیش‌نمایش روی نسخه **ذخیره‌شده** اجرا
 *     می‌شود، نه روی چیزی که در مرورگر است.
 */
export function Designer({
  definitionId,
  user,
  onBack,
}: {
  definitionId: string;
  user: CurrentUser;
  onBack: () => void;
}): JSX.Element {
  const detail = useTemplateDetail(definitionId);
  const sources = useDataSources();
  const signatories = useSignatories();

  const [versionId, setVersionId] = useState<string | null>(null);
  const version = useTemplateVersion(versionId);

  const [template, setTemplate] = useState<TemplateV1 | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<{ band: Band; index: number } | null>(null);
  const [tab, setTab] = useState<Tab>('structure');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverProblems, setServerProblems] = useState<readonly { path: string; message: string }[]>(
    [],
  );
  const [renaming, setRenaming] = useState<string | null>(null);

  const save = useSaveDraft();
  const publish = usePublishVersion();
  const activate = useActivateTemplate();
  const check = useCheckTemplate();
  const rename = useRenameTemplate();

  // نسخه پیش‌فرض برای باز کردن: آخرین پیش‌نویس، وگرنه نسخه منتشرشده جاری.
  useEffect(() => {
    if (versionId !== null || !detail.data) return;
    const draft = detail.data.versions.find((item) => item.status === 'DRAFT');
    setVersionId(draft?.id ?? detail.data.currentVersionId ?? detail.data.versions[0]?.id ?? null);
  }, [detail.data, versionId]);

  useEffect(() => {
    if (!version.data) return;
    setTemplate(version.data.template);
    setDirty(false);
    setSelected(null);
    setServerProblems([]);
  }, [version.data]);

  const clientProblems = useMemo(
    () => (template && sources.data ? templateProblems(template, sources.data) : []),
    [template, sources.data],
  );

  const schemaProblems = useMemo(() => {
    if (!template) return [];
    const parsed = templateV1Schema.safeParse(template);
    if (parsed.success) return [];
    return parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  }, [template]);

  if (detail.isPending || sources.isPending) return <LoadingState label="در حال خواندن قالب…" />;
  if (detail.isError || !detail.data) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" size="sm" onClick={onBack}>
          بازگشت
        </Button>
        <ErrorState
          title="خواندن قالب ناموفق بود"
          message={
            detail.error instanceof ApiError
              ? formatServerMessage(detail.error.message)
              : 'خطای نامشخص'
          }
          onRetry={() => void detail.refetch()}
        />
      </div>
    );
  }

  const definition = detail.data;
  const openedVersion = definition.versions.find((item) => item.id === versionId) ?? null;
  const isPublishedVersion = openedVersion?.status === 'PUBLISHED';
  const canWrite = user.permissions.includes('report_template:write') && !definition.isSystem;
  const canPublish = user.permissions.includes('report_template:publish');
  const readOnly = !canWrite || isPublishedVersion;
  const blockers = [...schemaProblems, ...clientProblems, ...serverProblems];
  const selectedBlock: Block | null =
    template && selected ? (bandBlocks(template, selected.band)[selected.index] ?? null) : null;

  function updateBlock(next: Block): void {
    if (!template || !selected) return;
    const blocks = [...bandBlocks(template, selected.band)];
    blocks[selected.index] = next;
    setTemplate(setBandBlocks(template, selected.band, blocks));
    setDirty(true);
  }

  function saveDraft(): void {
    if (!template) return;
    setError(null);
    setMessage(null);
    setServerProblems([]);

    save.mutate(
      { definitionId, template },
      {
        onSuccess: (result) => {
          setVersionId(result.id);
          setDirty(false);
          setMessage(
            `پیش‌نویس نسخه ${toPersianDigits(String(result.versionNo))} ذخیره شد`,
          );
          void detail.refetch();
        },
        onError: (caught) => {
          setServerProblems(problemsOf(caught));
          setError(
            caught instanceof ApiError
              ? formatServerMessage(caught.message)
              : 'ذخیره پیش‌نویس ناموفق بود',
          );
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <header className="no-print space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold">{definition.name}</h2>
              {definition.isSystem ? (
                <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  سیستمی — فقط خواندنی
                </span>
              ) : null}
              {definition.isActive ? (
                <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                  قالب فعال
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {definition.reportType.titleFa} ·{' '}
              {openedVersion
                ? `نسخه ${toPersianDigits(String(openedVersion.versionNo))} (${
                    openedVersion.status === 'PUBLISHED' ? 'منتشرشده' : 'پیش‌نویس'
                  })`
                : 'بدون نسخه'}
              {dirty ? ' · تغییرات ذخیره‌نشده' : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onBack}>
              بازگشت به فهرست
            </Button>

            {canWrite ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setRenaming(definition.name)}
              >
                تغییر نام
              </Button>
            ) : null}

            {canWrite ? (
              <Button
                size="sm"
                loading={save.isPending}
                disabled={!dirty || template === null || blockers.length > 0}
                onClick={saveDraft}
              >
                ذخیره پیش‌نویس
              </Button>
            ) : null}

            {canPublish && openedVersion?.status === 'DRAFT' ? (
              <Button
                size="sm"
                loading={publish.isPending}
                disabled={dirty || blockers.length > 0}
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  publish.mutate(
                    { versionId: openedVersion.id, definitionId },
                    {
                      onSuccess: (result) => {
                        setMessage(
                          result.becameActive
                            ? `نسخه ${toPersianDigits(String(result.versionNo))} منتشر و به‌عنوان قالب فعال انتخاب شد`
                            : `نسخه ${toPersianDigits(String(result.versionNo))} منتشر شد؛ برای اثرگذاری روی خروجی رسمی، قالب را فعال کنید`,
                        );
                        void detail.refetch();
                      },
                      onError: (caught) => {
                        setServerProblems(problemsOf(caught));
                        setError(
                          caught instanceof ApiError
                            ? formatServerMessage(caught.message)
                            : 'انتشار ناموفق بود',
                        );
                      },
                    },
                  );
                }}
              >
                انتشار نسخه
              </Button>
            ) : null}

            {canPublish && definition.status === 'PUBLISHED' && !definition.isActive ? (
              <Button
                size="sm"
                loading={activate.isPending}
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  activate.mutate(
                    { definitionId },
                    {
                      onSuccess: () => {
                        setMessage('این قالب، قالب فعال این نوع گزارش شد');
                        void detail.refetch();
                      },
                      onError: (caught) =>
                        setError(
                          caught instanceof ApiError
                            ? formatServerMessage(caught.message)
                            : 'فعال‌سازی ناموفق بود',
                        ),
                    },
                  );
                }}
              >
                فعال‌سازی این قالب
              </Button>
            ) : null}
          </div>
        </div>

        {definition.isSystem ? (
          <p className="rounded-md bg-muted p-2.5 text-xs leading-5 text-muted-foreground">
            قالب سیستمی ویرایش نمی‌شود تا همیشه یک مرجع بازگشت سالم باقی بماند. برای
            تغییر، از فهرست قالب‌ها یک «کپی» بسازید و کپی را ویرایش کنید.
          </p>
        ) : null}

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

        <ProblemList
          schemaProblems={schemaProblems}
          clientProblems={clientProblems}
          serverProblems={serverProblems}
          onServerCheck={
            template === null
              ? undefined
              : () => {
                  setServerProblems([]);
                  setError(null);
                  setMessage(null);
                  check.mutate(
                    { template },
                    {
                      onSuccess: () => setMessage('سرور ساختار این قالب را تأیید کرد'),
                      onError: (caught) => {
                        setServerProblems(problemsOf(caught));
                        setError(
                          caught instanceof ApiError
                            ? formatServerMessage(caught.message)
                            : 'اعتبارسنجی ناموفق بود',
                        );
                      },
                    },
                  );
                }
          }
          checking={check.isPending}
        />

        <nav className="flex gap-1 border-t border-border pt-2" aria-label="بخش‌های طراح">
          {(
            [
              ['structure', 'ساختار قالب'],
              ['preview', 'پیش‌نمایش و تاریخچه'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? 'page' : undefined}
              className={
                tab === key
                  ? 'rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary'
                  : 'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted'
              }
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {renaming !== null ? (
        <section className="no-print flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4">
          <div className="min-w-56 flex-1">
            <Input
              label="نام قالب"
              required
              value={renaming}
              maxLength={200}
              onChange={(event) => setRenaming(event.target.value)}
            />
          </div>
          <Button
            size="sm"
            loading={rename.isPending}
            disabled={renaming.trim() === ''}
            onClick={() =>
              rename.mutate(
                { definitionId, name: renaming.trim() },
                {
                  onSuccess: () => {
                    setRenaming(null);
                    setMessage('نام قالب تغییر کرد');
                    void detail.refetch();
                  },
                  onError: (caught) =>
                    setError(
                      caught instanceof ApiError
                        ? formatServerMessage(caught.message)
                        : 'تغییر نام ناموفق بود',
                    ),
                },
              )
            }
          >
            ثبت نام
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setRenaming(null)}>
            انصراف
          </Button>
        </section>
      ) : null}

      {version.isPending && versionId !== null ? <LoadingState label="در حال خواندن نسخه…" /> : null}

      {tab === 'preview' ? (
        <DesignerPreview
          versionId={versionId}
          reportTypeKey={definition.reportType.key}
          canExport={user.permissions.includes('report:export')}
          isActiveDefinition={definition.isActive}
        />
      ) : null}

      {tab === 'structure' && template ? (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)_22rem]">
          <aside className="space-y-4">
            <section className="rounded-lg border border-border bg-card p-3">
              <h3 className="mb-2 text-sm font-semibold">صفحه و قالب کلی</h3>
              <fieldset disabled={readOnly} className="space-y-3">
                <PageSettings
                  template={template}
                  onChange={(next) => {
                    setTemplate(next);
                    setDirty(true);
                  }}
                />
              </fieldset>
            </section>

            <section className="rounded-lg border border-border bg-card p-3">
              <DataDictionaryPanel sources={sources.data ?? []} />
            </section>

            <section className="rounded-lg border border-border bg-card p-3">
              <h3 className="mb-2 text-sm font-semibold">نسخه‌ها</h3>
              <ul className="space-y-1">
                {definition.versions.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (dirty && !window.confirm('تغییرات ذخیره‌نشده از دست می‌رود. ادامه؟')) {
                          return;
                        }
                        setVersionId(item.id);
                      }}
                      className={[
                        'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-xs hover:bg-muted',
                        item.id === versionId ? 'bg-primary/5 text-primary' : '',
                      ].join(' ')}
                    >
                      <span>
                        نسخه {toPersianDigits(String(item.versionNo))}
                        {item.id === definition.currentVersionId ? ' · جاری' : ''}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {item.status === 'PUBLISHED'
                          ? formatIsoAsJalali(item.publishedAt ?? item.createdAt)
                          : 'پیش‌نویس'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                نسخه منتشرشده تغییرناپذیر است. ذخیره روی نسخه منتشرشده، یک پیش‌نویس تازه
                می‌سازد و خروجی‌های تاریخی به نسخه خودشان بسته می‌مانند.
              </p>
            </section>
          </aside>

          <div>
            {readOnly ? (
              <p className="mb-3 rounded-md bg-muted p-2.5 text-xs text-muted-foreground">
                {isPublishedVersion && canWrite
                  ? 'این نسخه منتشر شده و تغییرناپذیر است. برای تغییر، آن را ویرایش کنید؛ ذخیره یک پیش‌نویس تازه می‌سازد.'
                  : 'شما اجازه ویرایش این قالب را ندارید.'}
              </p>
            ) : null}

            {isPublishedVersion && canWrite ? (
              <Button
                size="sm"
                variant="secondary"
                className="mb-3"
                onClick={() => {
                  // محتوای همین نسخه مبنای پیش‌نویس تازه می‌شود؛ ذخیره، نسخه تازه می‌سازد.
                  setDirty(true);
                  setVersionId(versionId);
                  setMessage(
                    'حالا می‌توانید ویرایش کنید. «ذخیره پیش‌نویس» یک نسخه تازه می‌سازد و این نسخه دست‌نخورده می‌ماند.',
                  );
                }}
              >
                ویرایش بر پایه این نسخه
              </Button>
            ) : null}

            <fieldset disabled={readOnly && !dirty}>
              <Canvas
                template={template}
                onChange={(next) => {
                  setTemplate(next);
                  setDirty(true);
                }}
                selected={selected}
                onSelect={setSelected}
              />
            </fieldset>
          </div>

          <aside>
            <section className="rounded-lg border border-border bg-card p-3">
              {selectedBlock ? (
                <fieldset disabled={readOnly && !dirty}>
                  <BlockSettings
                    template={template}
                    block={selectedBlock}
                    onChange={updateBlock}
                    sources={sources.data ?? []}
                    signatories={signatories.data ?? []}
                  />
                </fieldset>
              ) : (
                <p className="text-xs text-muted-foreground">
                  عنصری را از بوم انتخاب کنید تا تنظیماتش اینجا باز شود.
                </p>
              )}
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

/**
 * فهرست مشکلات قالب.
 *
 * سه منبع جدا نشان داده می‌شوند چون معنایشان جداست: schema («ساختار غلط است»)،
 * فهرست داده («به داده‌ای اشاره می‌کند که نیست») و سرور («مرجع نهایی چه می‌گوید»).
 * دکمه ذخیره تا وقتی هر سه خالی نشوند خاموش است.
 */
function ProblemList({
  schemaProblems,
  clientProblems,
  serverProblems,
  onServerCheck,
  checking,
}: {
  schemaProblems: readonly { path: string; message: string }[];
  clientProblems: readonly { path: string; message: string }[];
  serverProblems: readonly { path: string; message: string }[];
  onServerCheck?: (() => void) | undefined;
  checking: boolean;
}): JSX.Element {
  const all = [
    ...schemaProblems.map((item) => ({ ...item, source: 'ساختار' })),
    ...clientProblems.map((item) => ({ ...item, source: 'فهرست داده' })),
    ...serverProblems.map((item) => ({ ...item, source: 'سرور' })),
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            all.length === 0
              ? 'rounded bg-primary/10 px-2 py-0.5 text-[11px] text-primary'
              : 'rounded bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive'
          }
        >
          {all.length === 0
            ? 'قالب معتبر است'
            : `${toPersianDigits(String(all.length))} مشکل باید حل شود`}
        </span>

        {onServerCheck ? (
          <Button size="sm" variant="ghost" loading={checking} onClick={onServerCheck}>
            اعتبارسنجی روی سرور
          </Button>
        ) : null}
      </div>

      {all.length > 0 ? (
        <ul className="space-y-1 rounded-md bg-destructive/5 p-2.5">
          {all.map((problem, index) => (
            <li key={`${problem.path}-${index}`} className="text-xs text-destructive">
              <code dir="ltr" className="me-1.5 opacity-70">
                {problem.source}
                {problem.path === '' ? '' : ` · ${problem.path}`}
              </code>
              {problem.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
