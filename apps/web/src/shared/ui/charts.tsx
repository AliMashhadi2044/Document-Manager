import { useId, useMemo, useState } from 'react';

import { cn } from './cn';
import { formatMoney, toPersianDigits } from '../format/money';

/**
 * نمودارهای داشبورد — SVG دست‌ساز، بدون کتابخانه نمودار.
 *
 * چرا بدون کتابخانه: کتابخانه‌های رایج نمودار برای چیدمان چپ‌به‌راست ساخته شده‌اند و
 * برچسب، راهنما و tooltipشان در RTL جابه‌جا می‌شود؛ ارقام فارسی و جداکننده هزارگان
 * را هم باید با formatter دور زد. مهم‌تر از همه، **مبالغ ریالی در این برنامه رشته‌اند
 * و از ۲^۵۳ هم بزرگ‌ترند** (ADR-0003)؛ هر کتابخانه‌ای آن‌ها را به `number` تبدیل
 * می‌کند و بی‌صدا گرد می‌کند. اینجا مقیاس‌ها با `bigint` حساب می‌شوند و فقط **نسبت**
 * — که همیشه بین ۰ و ۱ است — به عدد ممیز شناور تبدیل می‌شود.
 *
 * دسترس‌پذیری: هر نمودار `role="img"` با نام فارسی دارد و کنارش یک جدول متنی پنهان
 * می‌آید تا داده با صفحه‌خوان هم قابل خواندن باشد — نمودار بدون متن، برای بخشی از
 * کاربران یعنی هیچ.
 */

/** نسبت یک مبلغ به بیشینه، به‌صورت عددی بین ۰ و ۱ — بدون از دست رفتن دقت. */
function ratioOf(value: bigint, max: bigint): number {
  if (max <= 0n) return 0;
  // تقسیم روی bigint با مقیاس ۱۰۰۰۰ انجام می‌شود و تازه بعد به Number می‌رود.
  return Number((value * 10_000n) / max) / 10_000;
}

function toBigInt(value: string | number): bigint {
  if (typeof value === 'number') return BigInt(Math.round(value));
  try {
    return BigInt(value || '0');
  } catch {
    return 0n;
  }
}

export interface ChartDatum {
  readonly label: string;
  /** مبلغ ریالی به‌صورت رشته، یا یک شمارش عددی. */
  readonly value: string | number;
  /** متن کمکی زیر برچسب (مثلاً تعداد فاکتور). */
  readonly hint?: string;
  /** شماره رنگ ۱ تا ۶؛ اگر داده نشود به ترتیب چیده می‌شود. */
  readonly colorIndex?: number;
}

const COLOR_VARS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
];

const colorAt = (index: number): string => COLOR_VARS[index % COLOR_VARS.length] as string;

/** جدول متنی پنهان — همان داده نمودار، برای صفحه‌خوان. */
function DataTableForScreenReaders({
  caption,
  data,
  money,
}: {
  caption: string;
  data: readonly ChartDatum[];
  money: boolean;
}): JSX.Element {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {data.map((item) => (
          <tr key={item.label}>
            <th scope="row">{item.label}</th>
            <td>
              {money
                ? formatMoney(String(item.value))
                : toPersianDigits(String(item.value))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * نمودار میله‌ای عمودی — برای روند ماهانه.
 *
 * محور افقی برچسب ماه دارد و ارتفاع هر میله نسبت آن ماه به بزرگ‌ترین ماه است.
 * ماه‌های خالی هم **نمایش داده می‌شوند** (میله صفر)، چون نبودِ داده در یک ماه خودش
 * اطلاعات است و حذف ستون، روند را دروغین نشان می‌دهد.
 */
export function BarChart({
  data,
  title,
  money = true,
  className,
}: {
  data: readonly ChartDatum[];
  title: string;
  money?: boolean;
  className?: string;
}): JSX.Element {
  const [active, setActive] = useState<number | null>(null);
  const max = useMemo(() => data.reduce((top, item) => {
    const value = toBigInt(item.value);
    return value > top ? value : top;
  }, 0n), [data]);

  if (data.length === 0) {
    return <p className="p-4 text-xs text-muted-foreground">داده‌ای برای نمایش نیست.</p>;
  }

  return (
    <div className={cn('w-full', className)}>
      <div role="img" aria-label={title} className="flex h-52 items-end gap-1.5">
        {data.map((item, index) => {
          const value = toBigInt(item.value);
          const share = ratioOf(value, max);
          const isActive = active === index;

          return (
            <div
              key={item.label}
              className="group relative flex h-full flex-1 flex-col justify-end"
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
            >
              {isActive ? (
                <div className="pointer-events-none absolute -top-1 start-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-2 py-1 text-[11px] shadow-[var(--shadow-lift)]">
                  <span className="font-medium">{item.label}</span>
                  <span className="ms-2 money text-muted-foreground">
                    {money ? formatMoney(String(item.value), { withUnit: false }) : toPersianDigits(String(item.value))}
                  </span>
                </div>
              ) : null}

              <div
                className={cn(
                  'w-full rounded-t-md transition-all duration-500',
                  value === 0n && 'bg-muted',
                )}
                style={{
                  height: `${Math.max(share * 100, value === 0n ? 2 : 4)}%`,
                  background: value === 0n ? undefined : colorAt(item.colorIndex ?? 0),
                  opacity: active === null || isActive ? 1 : 0.45,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1.5">
        {data.map((item) => (
          <span
            key={item.label}
            className="flex-1 truncate text-center text-[10px] text-muted-foreground"
            title={item.label}
          >
            {item.label}
          </span>
        ))}
      </div>

      <DataTableForScreenReaders caption={title} data={data} money={money} />
    </div>
  );
}

/**
 * نمودار حلقه‌ای — برای ترکیب وضعیت‌ها.
 *
 * حلقه با `stroke-dasharray` روی یک دایره ساخته می‌شود، نه با مسیرهای کمانی: ساده‌تر،
 * و انیمیشن ورودش هم طبیعی است. سهم‌های خیلی کوچک حذف نمی‌شوند؛ حداقل یک شکاف قابل
 * دیدن می‌گیرند تا «وجود دارد ولی کم است» با «وجود ندارد» اشتباه نشود.
 */
export function DonutChart({
  data,
  title,
  centerLabel,
  centerValue,
  money = true,
}: {
  data: readonly ChartDatum[];
  title: string;
  centerLabel?: string;
  centerValue?: string;
  money?: boolean;
}): JSX.Element {
  const gradientId = useId();
  const total = useMemo(
    () => data.reduce((sum, item) => sum + toBigInt(item.value), 0n),
    [data],
  );

  if (data.length === 0 || total === 0n) {
    return <p className="p-4 text-xs text-muted-foreground">داده‌ای برای نمایش نیست.</p>;
  }

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const segments = data.map((item, index) => {
    const share = ratioOf(toBigInt(item.value), total);
    const length = Math.max(share * circumference, share > 0 ? 2 : 0);
    const segment = { item, index, length, offset, share };
    offset += length;
    return segment;
  });

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div className="relative">
        <svg
          viewBox="0 0 160 160"
          className="size-40 -rotate-90"
          role="img"
          aria-label={title}
          key={gradientId}
        >
          <circle cx="80" cy="80" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="18" />
          {segments.map(({ item, index, length, offset: start }) => (
            <circle
              key={item.label}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={colorAt(item.colorIndex ?? index)}
              strokeWidth="18"
              strokeLinecap="butt"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-start}
            />
          ))}
        </svg>

        {centerValue ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="money text-base font-bold">{centerValue}</span>
            {centerLabel ? (
              <span className="text-[11px] text-muted-foreground">{centerLabel}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <ul className="min-w-44 flex-1 space-y-2">
        {data.map((item, index) => {
          const share = ratioOf(toBigInt(item.value), total);
          return (
            <li key={item.label} className="flex items-center gap-2.5 text-xs">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: colorAt(item.colorIndex ?? index) }}
              />
              <span className="min-w-0 flex-1 truncate" title={item.label}>
                {item.label}
              </span>
              <span className="money shrink-0 text-muted-foreground">
                {toPersianDigits(String(Math.round(share * 100)))}٪
              </span>
            </li>
          );
        })}
      </ul>

      <DataTableForScreenReaders caption={title} data={data} money={money} />
    </div>
  );
}

/**
 * نمودار خطی با سطح زیرین — برای روند تجمعی.
 *
 * خط با انیمیشن کشیده می‌شود (`--animate-draw`) و نقطه‌های داده قابل hover هستند.
 */
export function AreaChart({
  data,
  title,
  money = true,
  className,
}: {
  data: readonly ChartDatum[];
  title: string;
  money?: boolean;
  className?: string;
}): JSX.Element {
  const gradientId = useId().replace(/:/g, '');
  const [active, setActive] = useState<number | null>(null);

  const max = useMemo(
    () => data.reduce((top, item) => {
      const value = toBigInt(item.value);
      return value > top ? value : top;
    }, 0n),
    [data],
  );

  if (data.length < 2) {
    return <p className="p-4 text-xs text-muted-foreground">برای رسم روند، دست‌کم دو نقطه لازم است.</p>;
  }

  const width = 600;
  const height = 180;
  const padding = 8;
  const step = (width - padding * 2) / (data.length - 1);

  const points = data.map((item, index) => {
    const share = ratioOf(toBigInt(item.value), max);
    return {
      x: padding + index * step,
      y: height - padding - share * (height - padding * 2),
      item,
      index,
    };
  });

  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`;

  return (
    <div className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full"
        role="img"
        aria-label={title}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-chart-1)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ strokeDasharray: 2000, ['--draw-length' as string]: 2000 }}
          className="animate-[var(--animate-draw)]"
        />

        {points.map((point) => (
          <circle
            key={point.item.label}
            cx={point.x}
            cy={point.y}
            r={active === point.index ? 5 : 3}
            fill="var(--color-card)"
            stroke="var(--color-chart-1)"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
            onMouseEnter={() => setActive(point.index)}
            onMouseLeave={() => setActive(null)}
          />
        ))}
      </svg>

      <div className="mt-1 flex">
        {data.map((item, index) => (
          <span
            key={item.label}
            className={cn(
              'flex-1 truncate text-center text-[10px]',
              active === index ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {active === index
              ? money
                ? formatMoney(String(item.value), { withUnit: false })
                : toPersianDigits(String(item.value))
              : item.label}
          </span>
        ))}
      </div>

      <DataTableForScreenReaders caption={title} data={data} money={money} />
    </div>
  );
}

/**
 * فهرست رتبه‌بندی با نوار نسبی — برای «ده فروشنده برتر» و مانند آن.
 *
 * نوار، سهم هر ردیف از **بزرگ‌ترین** ردیف را نشان می‌دهد نه از جمع کل: هدف مقایسه
 * ردیف‌ها با هم است، نه سهم از یک کل.
 */
export function RankedBars({
  data,
  title,
  countLabel,
  money = true,
}: {
  data: readonly ChartDatum[];
  title: string;
  countLabel?: string;
  money?: boolean;
}): JSX.Element {
  const max = useMemo(
    () => data.reduce((top, item) => {
      const value = toBigInt(item.value);
      return value > top ? value : top;
    }, 0n),
    [data],
  );

  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">داده‌ای برای نمایش نیست.</p>;
  }

  return (
    <ul className="space-y-3" aria-label={title}>
      {data.map((item, index) => {
        const share = ratioOf(toBigInt(item.value), max);
        return (
          <li key={`${item.label}-${index}`} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-medium text-muted-foreground"
                >
                  {toPersianDigits(String(index + 1))}
                </span>
                <span className="truncate" title={item.label}>
                  {item.label}
                </span>
              </span>
              <span className="money shrink-0 font-medium">
                {money ? formatMoney(String(item.value), { withUnit: false }) : toPersianDigits(String(item.value))}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.max(share * 100, 1.5)}%`, background: colorAt(index) }}
                />
              </div>
              {item.hint ? (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {item.hint}
                  {countLabel ? ` ${countLabel}` : ''}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
