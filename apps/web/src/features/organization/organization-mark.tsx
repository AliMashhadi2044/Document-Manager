import { useState } from 'react';

import { cn } from '../../shared/ui/cn';
import { organizationLogoUrl, useOrganization } from './organization.api';

/**
 * نشان سازمان در نوار کناری و صفحه ورود.
 *
 * اگر سازمان نشان بارگذاری کرده باشد همان نشان دیده می‌شود، وگرنه یک نشان پیش‌فرض
 * SVG که از رنگ اصلی تم رنگ می‌گیرد. حالت سوم هم هست و مهم است: نشانی که **تنظیم
 * شده ولی بارگذاری‌اش شکست خورده** — در آن حالت هم به نشان پیش‌فرض برمی‌گردیم تا
 * یک آیکون شکسته در سربرگ نماند.
 */
export function OrganizationMark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string | undefined;
}): JSX.Element {
  const organization = useOrganization();
  const [failed, setFailed] = useState(false);

  const logoPath = organization.data?.logoPath ?? null;

  if (logoPath && !failed) {
    return (
      <img
        src={organizationLogoUrl(logoPath)}
        alt={organization.data?.name ?? 'نشان سازمان'}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={cn('shrink-0 rounded-lg object-contain', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return <DefaultMark size={size} className={className} />;
}

/**
 * نشان پیش‌فرض: برگه سند با یک علامت ریال.
 *
 * عمداً تک‌رنگ و بر پایه `currentColor` نیست بلکه از گرادیان رنگ اصلی تم استفاده
 * می‌کند تا با انتخاب رنگ کاربر عوض شود.
 */
export function DefaultMark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string | undefined;
}): JSX.Element {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label="نشان سامانه"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id="dm-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--accent))" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="48" height="48" rx="13" fill="url(#dm-mark)" />
      <path
        d="M17 13h10l6 6v16a2 2 0 0 1-2 2H17a2 2 0 0 1-2-2V15a2 2 0 0 1 2-2z"
        fill="hsl(var(--primary-foreground))"
        fillOpacity="0.92"
      />
      <path d="M27 13v6h6" fill="none" stroke="url(#dm-mark)" strokeWidth="1.8" strokeLinejoin="round" />
      <path
        d="M20 30h8M24 30v-7M21.5 25.5h5"
        fill="none"
        stroke="url(#dm-mark)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
