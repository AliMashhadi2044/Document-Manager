import { useEffect, useState } from 'react';
import { ROLE_LABELS, type Permission, type RoleKey } from '@dm/shared';

import { Button } from '../shared/ui/button';
import { Icon, type IconName } from '../shared/ui/icon';
import { cn } from '../shared/ui/cn';
import { useLogout, type CurrentUser } from '../features/auth/auth.api';
import { LookupManager } from '../features/base-data/lookup-manager';
import { ChaptersView } from '../features/base-data/chapters-view';
import { VendorsPage } from '../features/vendors/vendors-page';
import { DocumentsPage } from '../features/documents/documents-page';
import { ArchivePage } from '../features/archive/archive-page';
import { ReportTemplatesPage } from '../features/report-designer/templates-page';
import { ReportsPage } from '../features/analytics/reports-page';
import { DashboardPage } from '../features/analytics/dashboard-page';
import { NotificationBell } from '../features/notifications/notification-bell';
import { OrganizationMark } from '../features/organization/organization-mark';
import { AppearanceMenu } from './appearance-menu';
import { ProjectOverview } from './project-overview';

type SectionKey =
  | 'dashboard'
  | 'documents'
  | 'archive'
  | 'reports'
  | 'report-templates'
  | 'overview'
  | 'lookups'
  | 'chapters'
  | 'vendors';

interface Section {
  readonly key: SectionKey;
  readonly titleFa: string;
  readonly icon: IconName;
  /** زیرعنوان سربرگ صفحه — به کاربر می‌گوید اینجا چه کاری انجام می‌شود. */
  readonly description: string;
  /** مجوز لازم برای دیدن این بخش — فقط برای تجربه کاربری؛ مرجع، سرور است. */
  readonly permission?: Permission;
}

interface SectionGroup {
  readonly titleFa: string;
  readonly items: readonly Section[];
}

/**
 * گروه‌بندی منو بر اساس **کاری که کاربر انجام می‌دهد**، نه ساختار ماژول‌های کد.
 *
 * کارپردازی روز کاری‌اش را در گروه اول می‌گذراند؛ گزارش و اطلاعات پایه کارهای
 * دوره‌ای‌اند و پایین‌تر می‌آیند. گروهی که همه آیتم‌هایش بی‌مجوز باشد، اصلاً نمایش
 * داده نمی‌شود (نه اینکه یک عنوان خالی بماند).
 */
const GROUPS: readonly SectionGroup[] = [
  {
    titleFa: 'کار روزمره',
    items: [
      {
        key: 'dashboard',
        titleFa: 'داشبورد',
        icon: 'dashboard',
        description: 'نمای کلی اسناد، مبالغ و روند ماهانه در دامنه دسترسی شما',
        permission: 'report:run',
      },
      {
        key: 'documents',
        titleFa: 'اسناد',
        icon: 'documents',
        description: 'ایجاد، ویرایش و ثبت نهایی اسناد و فاکتورها',
        permission: 'document:read',
      },
      {
        key: 'archive',
        titleFa: 'بایگانی',
        icon: 'archive',
        description: 'ثبت شماره و تاریخ سند، بارگذاری اسکن و بازخورد ناظر',
        permission: 'archive:read',
      },
    ],
  },
  {
    titleFa: 'گزارش‌ها',
    items: [
      {
        key: 'reports',
        titleFa: 'گزارش‌گیری',
        icon: 'chart',
        description: 'فیلتر، مرتب‌سازی و خروجی گرفتن از داده‌ها',
        permission: 'report:run',
      },
      {
        key: 'report-templates',
        titleFa: 'طراح گزارش',
        icon: 'template',
        description: 'ساخت و انتشار قالب گزارش، بدون نیاز به تغییر کد',
        permission: 'report_template:read',
      },
    ],
  },
  {
    titleFa: 'اطلاعات پایه',
    items: [
      {
        key: 'lookups',
        titleFa: 'اطلاعات پایه',
        icon: 'database',
        description: 'فهرست‌های مرجع: واحد، نوع انشعاب، نوع سوخت و مانند آن',
        permission: 'base_data:read',
      },
      {
        key: 'chapters',
        titleFa: 'فصل‌ها و انواع فاکتور',
        icon: 'layers',
        description: 'اتصال فصل بودجه به نوع فاکتور مجاز',
        permission: 'base_data:read',
      },
      {
        key: 'vendors',
        titleFa: 'فروشندگان',
        icon: 'store',
        description: 'فروشندگان، شناسه‌های هویتی و حساب‌های بانکی',
        permission: 'vendor:read',
      },
    ],
  },
  {
    titleFa: 'سامانه',
    items: [
      {
        key: 'overview',
        titleFa: 'وضعیت پروژه',
        icon: 'info',
        description: 'آنچه ساخته شده و مجوزهای کاربر جاری',
      },
    ],
  },
];

export function AppShell({ user }: { user: CurrentUser }): JSX.Element {
  const [section, setSection] = useState<SectionKey>('documents');
  /** سندی که از اعلان باز می‌شود؛ تا پیش از مسیر‌یابی واقعی، همین کافی است. */
  const [documentFromNotification, setDocumentFromNotification] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const logout = useLogout();

  const visibleGroups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => item.permission === undefined || user.permissions.includes(item.permission),
    ),
  })).filter((group) => group.items.length > 0);

  const current =
    visibleGroups.flatMap((group) => group.items).find((item) => item.key === section) ??
    visibleGroups[0]?.items[0];

  // کاربری که مجوز بخش پیش‌فرض را ندارد (مثلاً ناظر) نباید صفحه خالی ببیند.
  useEffect(() => {
    const allowed = visibleGroups.flatMap((group) => group.items).some((item) => item.key === section);
    if (!allowed && current) setSection(current.key);
  }, [current, section, visibleGroups]);

  // کشوی موبایل پس از انتخاب بخش بسته می‌شود؛ باز ماندنش روی محتوا، آزاردهنده است.
  const go = (key: SectionKey): void => {
    setSection(key);
    setDrawerOpen(false);
  };

  const navigation = (
    <nav aria-label="بخش‌های سامانه" className="flex-1 overflow-y-auto px-3 py-2">
      {visibleGroups.map((group) => (
        <div key={group.titleFa} className="mb-4">
          <p className="px-3 pb-1.5 text-[11px] font-medium text-muted-foreground">
            {group.titleFa}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const isCurrent = item.key === section;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => go(item.key)}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={cn(
                      'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      isCurrent
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {/* نشانه‌ی بخش فعال در لبه، علاوه بر رنگ — رنگ به‌تنهایی کافی نیست. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute -start-3 h-5 w-1 rounded-e-full bg-primary transition-opacity',
                        isCurrent ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <Icon name={item.icon} className="shrink-0" />
                    <span className="truncate">{item.titleFa}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      {/* ───────────── نوار کناری (دسکتاپ) ───────────── */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-e border-border bg-card lg:flex">
        <BrandHeader />
        {navigation}
        <UserCard user={user} />
      </aside>

      {/* ───────────── کشوی موبایل ───────────── */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="بستن منو"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 start-0 flex w-72 flex-col border-e border-border bg-card animate-[var(--animate-rise)]">
            <BrandHeader />
            {navigation}
            <UserCard user={user} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col">
        {/* ───────────── سربرگ ───────────── */}
        <header className="surface sticky top-0 z-40 border-b border-border">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                aria-label="باز کردن منو"
                onClick={() => setDrawerOpen(true)}
              >
                <Icon name="menu" />
              </Button>

              <div className="min-w-0">
                <h1 className="truncate text-base font-bold">{current?.titleFa ?? 'سامانه'}</h1>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">
                  {current?.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <NotificationBell
                onOpenDocument={(documentId) => {
                  setDocumentFromNotification(documentId);
                  go('documents');
                }}
              />
              <AppearanceMenu canManageBranding={user.permissions.includes('base_data:write')} />
              <Button
                variant="ghost"
                size="sm"
                loading={logout.isPending}
                onClick={() => logout.mutate()}
              >
                <Icon name="logout" />
                <span className="hidden sm:inline">خروج</span>
              </Button>
            </div>
          </div>
        </header>

        {/* ───────────── محتوا ───────────── */}
        <main
          className={cn(
            'mx-auto w-full flex-1 px-4 py-6 sm:px-6',
            // گزارش‌گیری و طراح گزارش ستون‌های زیادی دارند و در عرض معمول خفه می‌شوند.
            section === 'reports' || section === 'report-templates' || section === 'dashboard'
              ? 'max-w-[110rem]'
              : 'max-w-6xl',
          )}
        >
          <div key={section} className="animate-[var(--animate-fade-in)]">
            {section === 'documents' ? (
              <DocumentsPage
                openDocumentId={documentFromNotification}
                onOpenedDocument={() => setDocumentFromNotification(null)}
              />
            ) : null}
            {section === 'archive' ? <ArchivePage user={user} /> : null}
            {section === 'reports' ? <ReportsPage user={user} /> : null}
            {section === 'report-templates' ? <ReportTemplatesPage user={user} /> : null}
            {section === 'dashboard' ? <DashboardPage /> : null}
            {section === 'overview' ? <ProjectOverview user={user} /> : null}
            {section === 'lookups' ? <LookupManager /> : null}
            {section === 'chapters' ? <ChaptersView /> : null}
            {section === 'vendors' ? <VendorsPage /> : null}
          </div>
        </main>
      </div>
    </div>
  );
}

function BrandHeader(): JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-4">
      <OrganizationMark />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold leading-5">مدیریت اسناد</p>
        <p className="truncate text-[11px] text-muted-foreground">کارپردازی</p>
      </div>
    </div>
  );
}

function UserCard({ user }: { user: CurrentUser }): JSX.Element {
  const initials = user.fullName.trim().slice(0, 1) || '؟';

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.fullName}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {user.roles.map((role) => ROLE_LABELS[role as RoleKey] ?? role).join('، ')}
          </p>
        </div>
      </div>
    </div>
  );
}
