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
/**
 * مسیر نرم از میان چند نقطه — Catmull–Rom تبدیل‌شده به منحنی بزیه مکعبی.
 *
 * چرا نه خط شکسته: روند ماهانه یک کمیت پیوسته است؛ زاویه‌های تیز در هر نقطه،
 * شکستی را نشان می‌دهند که در داده نیست.
 *
 * مهار عمودی عمدی است: منحنی بدون مهار، بین دو نقطه از خط مبنا پایین‌تر می‌رود و
 * مقداری منفی را نشان می‌دهد که وجود ندارد — در یک سامانه مالی، اطلاعات غلط.
 */
function smoothPath(
  points: readonly { x: number; y: number }[],
  topLimit: number,
  bottomLimit: number,
): string {
  const first = points[0];
  if (!first) return '';

  const clamp = (value: number): number => Math.min(bottomLimit, Math.max(topLimit, value));
  let path = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (!current || !next) break;

    const previous = points[index - 1] ?? current;
    const after = points[index + 2] ?? next;

    const c1x = current.x + (next.x - previous.x) / 6;
    const c1y = clamp(current.y + (next.y - previous.y) / 6);
    const c2x = next.x - (after.x - current.x) / 6;
    const c2y = clamp(next.y - (after.y - current.y) / 6);

    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }

  return path;
}

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

  const curve = smoothPath(points, padding, height - padding);
  const baseline = height - padding;
  const last = points[points.length - 1];
  const area = `${curve} L ${(last?.x ?? width - padding).toFixed(2)} ${baseline} L ${padding} ${baseline} Z`;

  return (
    <div className={cn('w-full', className)}>
      {/*
        نقطه‌ها عنصر HTML اند، نه `circle` درون SVG.

        این SVG با `preserveAspectRatio="none"` کشیده می‌شود تا عرض کارت را پر کند؛
        کشیدگی افقی هر دایره‌ای را به بیضی تبدیل می‌کند. خط و سطح از کشیدگی آسیبی
        نمی‌بینند (ضخامت هم با `non-scaling-stroke` ثابت است)، پس فقط نقطه‌ها بیرون
        گذاشته شدند و با درصد جایگذاری می‌شوند.
      */}
      <div className="relative">
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

          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={curve}
            fill="none"
            stroke="var(--color-chart-1)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ strokeDasharray: 2000, ['--draw-length' as string]: 2000 }}
            className="animate-[var(--animate-draw)]"
          />
        </svg>

        {points.map((point) => (
          <span
            key={point.item.label}
            aria-hidden="true"
            onMouseEnter={() => setActive(point.index)}
            onMouseLeave={() => setActive(null)}
            style={{ left: `${(point.x / width) * 100}%`, top: `${(point.y / height) * 100}%` }}
            className={cn(
              'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card',
              'border-[var(--color-chart-1)] transition-all duration-150',
              active === point.index ? 'size-3.5 shadow-[var(--shadow-lift)]' : 'size-2.5',
            )}
          />
        ))}
      </div>

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

/**
 * خط روند کوچک (sparkline) برای داخل کارت‌های آمار.
 *
 * بدون محور و بدون برچسب — عمداً. کارِ این نمودار «خواندن عدد» نیست، نشان دادن
 * **شکل** تغییر است در کنار عددی که همان‌جا نوشته شده. افزودن محور به چیزی به این
 * اندازه، فقط شلوغی است.
 */
export function Sparkline({
  values,
  title,
  tone = 'var(--color-chart-1)',
  className,
}: {
  values: readonly (string | number)[];
  title: string;
  tone?: string;
  className?: string;
}): JSX.Element | null {
  const gradientId = useId().replace(/:/g, '');
  const numbers = values.map(toBigInt);
  const max = numbers.reduce((top, value) => (value > top ? value : top), 0n);

  if (numbers.length < 2) return null;

  const width = 120;
  const height = 32;
  const step = width / (numbers.length - 1);
  const points = numbers.map((value, index) => ({
    x: index * step,
    y: height - 2 - ratioOf(value, max) * (height - 6),
  }));

  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <div className={cn('relative', className)}>
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-8 w-full"
      role="img"
      aria-label={title}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.3" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${line} ${width},${height}`} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={tone}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>

      {/* نقطه پایانی خارج از SVG کشیده‌شده، تا دایره بماند و بیضی نشود. */}
      {last ? (
        <span
          aria-hidden="true"
          style={{
            left: `${(last.x / width) * 100}%`,
            top: `${(last.y / height) * 100}%`,
            background: tone,
          }}
          className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        />
      ) : null}
    </div>
  );
}

/**
 * عقربه نیم‌دایره‌ای برای نمایش یک **نسبت**.
 *
 * نیم‌دایره، نه دایره کامل: دایره کامل یعنی «سهم از یک کل» و اینجا منظور «چقدر از
 * حداکثر» است. کمان با `stroke-dasharray` ساخته می‌شود و با تغییر مقدار، نرم حرکت
 * می‌کند.
 */
export function Gauge({
  ratio,
  label,
  value,
  title,
  tone = 'var(--color-chart-1)',
}: {
  /** عددی بین ۰ و ۱. */
  ratio: number;
  label: string;
  value: string;
  title: string;
  tone?: string;
}): JSX.Element {
  const radius = 54;
  const circumference = Math.PI * radius;
  const clamped = Math.min(Math.max(ratio, 0), 1);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 78" className="h-20 w-36" role="img" aria-label={title}>
        <path
          d={`M 16 70 A ${radius} ${radius} 0 0 1 124 70`}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d={`M 16 70 A ${radius} ${radius} 0 0 1 124 70`}
          fill="none"
          stroke={tone}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${clamped * circumference} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <p className="money -mt-3 text-lg font-bold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
