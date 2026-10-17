import { Card, CardBody, CardHeader } from '../shared/ui/card';
import { Badge } from '../shared/ui/badge';
import { Icon } from '../shared/ui/icon';
import { toPersianDigits } from '../shared/format/money';
import type { CurrentUser } from '../features/auth/auth.api';

const PHASES: readonly { readonly title: string; readonly summary: string }[] = [
  { title: 'زیرساخت و سیستم طراحی', summary: 'معماری، مجوزها، نشست و پایه رابط' },
  { title: 'اطلاعات پایه و فروشندگان', summary: 'فهرست‌های مرجع، فصل‌ها و شناسه‌های هویتی' },
  { title: 'اسناد و فاکتورها', summary: 'محاسبات مالی، snapshot و ثبت نهایی تراکنشی' },
  { title: 'فاکتورهای اختصاصی', summary: 'انشعابات و سوخت با اتصال پویای فصل به نوع فاکتور' },
  { title: 'بایگانی و بازخورد', summary: 'فایل امن، بازخورد ناظر و اعلان‌ها' },
  { title: 'گزارش مالیات', summary: 'موتور قالب و خروجی چاپ و Excel و PDF' },
  { title: 'طراح گزارش', summary: 'ساخت بصری قالب با نسخه‌گذاری و انتشار' },
  { title: 'گزارش‌گیری عمومی', summary: 'فیلترساز، نمای ذخیره‌شده، خروجی صف‌شده و داشبورد' },
  { title: 'سخت‌سازی و انتشار', summary: 'چک‌لیست امنیتی، CI، آزمون E2E و تصویر production' },
];

/**
 * وضعیت پروژه.
 *
 * این صفحه عمداً ادعای کلی نمی‌کند؛ فهرست فازها و **مجوزهای واقعی کاربر جاری** را
 * نشان می‌دهد. مجوزها از پاسخ سرور می‌آیند، نه از فهرستی در رابط — یعنی اگر نقشی
 * عوض شود، همین‌جا دیده می‌شود.
 */
export function ProjectOverview({ user }: { user: CurrentUser }): JSX.Element {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon="info"
          title="وضعیت پروژه"
          description="هیچ بخشی از این سامانه داده ساختگی نمایش نمی‌دهد؛ همه اعداد از پایگاه داده واقعی می‌آیند."
        />
        <CardBody className="pt-3">
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PHASES.map((phase, index) => (
              <li
                key={phase.title}
                className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3"
              >
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <Icon name="check" size={14} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <span className="text-muted-foreground">
                      فاز {toPersianDigits(String(index + 1))} ·{' '}
                    </span>
                    {phase.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{phase.summary}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon="users"
          title={`مجوزهای شما (${toPersianDigits(String(user.permissions.length))})`}
          description="هر مجوز یک در ورودی مشخص در سرور است؛ رابط چیزی بیش از این‌ها نشان نمی‌دهد."
        />
        <CardBody className="pt-3">
          <ul className="flex flex-wrap gap-1.5">
            {user.permissions.map((permission) => (
              <li key={permission}>
                <Badge tone="neutral" className="font-mono text-[11px]">
                  <span dir="ltr">{permission}</span>
                </Badge>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
