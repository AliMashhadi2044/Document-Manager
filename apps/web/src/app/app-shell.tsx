import { useState } from 'react';
import { ROLE_LABELS, type Permission, type RoleKey } from '@dm/shared';

import { Button } from '../shared/ui/button';
import { useLogout, type CurrentUser } from '../features/auth/auth.api';
import { LookupManager } from '../features/base-data/lookup-manager';
import { ChaptersView } from '../features/base-data/chapters-view';
import { VendorsPage } from '../features/vendors/vendors-page';
import { DocumentsPage } from '../features/documents/documents-page';
import { ArchivePage } from '../features/archive/archive-page';
import { NotificationBell } from '../features/notifications/notification-bell';
import { ThemeControls } from './theme-controls';

type SectionKey =
  | 'documents'
  | 'archive'
  | 'overview'
  | 'lookups'
  | 'chapters'
  | 'vendors'
  | 'settings';

interface Section {
  readonly key: SectionKey;
  readonly titleFa: string;
  /** مجوز لازم برای دیدن این بخش — فقط برای تجربه کاربری؛ مرجع، سرور است. */
  readonly permission?: Permission;
}

const SECTIONS: readonly Section[] = [
  { key: 'documents', titleFa: 'اسناد', permission: 'document:read' },
  { key: 'archive', titleFa: 'بایگانی', permission: 'archive:read' },
  { key: 'overview', titleFa: 'وضعیت پروژه' },
  { key: 'lookups', titleFa: 'اطلاعات پایه', permission: 'base_data:read' },
  { key: 'chapters', titleFa: 'فصل‌ها و انواع فاکتور', permission: 'base_data:read' },
  { key: 'vendors', titleFa: 'فروشندگان', permission: 'vendor:read' },
  { key: 'settings', titleFa: 'تنظیمات ظاهر' },
];

export function AppShell({ user }: { user: CurrentUser }): JSX.Element {
  const [section, setSection] = useState<SectionKey>('documents');
  /** سندی که از اعلان باز می‌شود؛ تا پیش از مسیر‌یابی واقعی، همین کافی است. */
  const [documentFromNotification, setDocumentFromNotification] = useState<string | null>(null);
  const logout = useLogout();

  const visible = SECTIONS.filter(
    (item) => item.permission === undefined || user.permissions.includes(item.permission),
  );

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-base font-bold">سامانه مدیریت اسناد کارپردازی</h1>
            <p className="text-xs text-muted-foreground">
              {user.fullName} ·{' '}
              {user.roles.map((role) => ROLE_LABELS[role as RoleKey] ?? role).join('، ')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell
              onOpenDocument={(documentId) => {
                setDocumentFromNotification(documentId);
                setSection('documents');
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              loading={logout.isPending}
              onClick={() => logout.mutate()}
            >
              خروج
            </Button>
          </div>
        </div>

        <nav className="mx-auto max-w-6xl px-6" aria-label="بخش‌های سامانه">
          <ul className="flex flex-wrap gap-1 border-t border-border pt-2">
            {visible.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => setSection(item.key)}
                  aria-current={section === item.key ? 'page' : undefined}
                  className={
                    section === item.key
                      ? 'rounded-t-md border-b-2 border-primary px-3 py-2 text-sm font-medium text-primary'
                      : 'rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground'
                  }
                >
                  {item.titleFa}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {section === 'documents' ? (
          <DocumentsPage
            openDocumentId={documentFromNotification}
            onOpenedDocument={() => setDocumentFromNotification(null)}
          />
        ) : null}
        {section === 'archive' ? <ArchivePage user={user} /> : null}
        {section === 'overview' ? <Overview user={user} /> : null}
        {section === 'lookups' ? <LookupManager /> : null}
        {section === 'chapters' ? <ChaptersView /> : null}
        {section === 'vendors' ? <VendorsPage /> : null}
        {section === 'settings' ? <ThemeControls /> : null}
      </main>
    </div>
  );
}

function Overview({ user }: { user: CurrentUser }): JSX.Element {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">وضعیت پروژه</h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          فازهای ۱ تا ۶ تکمیل شده‌اند: زیرساخت و سیستم طراحی، اطلاعات پایه و فروشندگان،
          اسناد و فاکتورهای اصلی با محاسبات مالی و snapshot و ثبت نهایی تراکنشی،
          فاکتورهای اختصاصی انشعابات و سوخت با اتصال پویای فصل به نوع فاکتور، بایگانی
          با فایل امن و بازخورد ناظر و اعلان، و گزارش مالیات با موتور قالب و خروجی چاپ و
          Excel و PDF. طراح بصری گزارش و گزارش‌گیری عمومی در فازهای بعدی اضافه می‌شوند.
          هیچ بخشی از این سامانه داده ساختگی نمایش نمی‌دهد؛ همه اعداد از پایگاه داده
          واقعی می‌آیند.
        </p>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">مجوزهای شما ({user.permissions.length})</h2>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {user.permissions.map((permission) => (
            <li
              key={permission}
              dir="ltr"
              className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              {permission}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
