import { Card, CardBody } from '../../shared/ui/card';
import { Shimmer } from '../../shared/ui/states';

/**
 * اسکلت داشبورد در زمان بارگذاری.
 *
 * چرا اسکلت و نه یک چرخنده وسط صفحه: اسکلت **شکل صفحه بعدی** را نشان می‌دهد، پس
 * وقتی داده می‌رسد چیدمان نمی‌پرد و کاربر حس انتظار کمتری دارد. این اسکلت عمداً
 * همان شبکه‌بندی داشبورد واقعی را دارد، نه چند مستطیل تصادفی.
 */
export function DashboardSkeleton(): JSX.Element {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">در حال خواندن داشبورد…</span>

      <div className="flex items-end justify-between gap-4">
        <Shimmer className="h-4 w-80" />
        <Shimmer className="h-10 w-48" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index} className="p-4">
            <div className="flex items-start gap-3">
              <Shimmer className="size-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Shimmer className="h-3 w-16" />
                <Shimmer className="h-5 w-24" />
                <Shimmer className="h-2.5 w-20" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((index) => (
            <Shimmer key={index} className="h-16 rounded-lg" />
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <Shimmer className="h-4 w-48" />
          {/* میله‌های نمودار با ارتفاع‌های متفاوت — شکل همان نموداری که می‌آید. */}
          <div className="flex h-52 items-end gap-1.5">
            {[42, 68, 35, 80, 55, 72, 48, 90, 60, 38, 75, 52].map((height, index) => (
              <Shimmer
                key={index}
                className="flex-1 rounded-t-md"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {[0, 1].map((index) => (
          <Card key={index}>
            <CardBody className="flex flex-wrap items-center justify-center gap-6">
              <Shimmer className="size-40 rounded-full" />
              <div className="min-w-44 flex-1 space-y-3">
                {[0, 1, 2, 3].map((row) => (
                  <Shimmer key={row} className="h-3 w-full" />
                ))}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
