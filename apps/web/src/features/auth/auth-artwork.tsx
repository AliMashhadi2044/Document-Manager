/**
 * تصویر صفحه ورود — SVG، نه یک عکس.
 *
 * چرا SVG: این تصویر نیمی از صفحه ورود را می‌گیرد و باید در هر اندازه‌ای تیز بماند،
 * با تم روشن و تاریک و با **رنگ اصلیِ انتخابی کاربر** هماهنگ شود، و وزن بسته را
 * بالا نبرد. یک عکس bitmap هیچ‌کدام را نمی‌دهد: یا در تم تاریک ناجور می‌شود یا
 * صدها کیلوبایت به بار اولیه اضافه می‌کند.
 *
 * صحنه، همان کاری است که سامانه انجام می‌دهد: برگه‌های سند، ردیف‌های مبلغ و یک
 * نمودار — نه یک تصویر تزئینی بی‌ربط.
 */
export function AuthArtwork(): JSX.Element {
  return (
    <svg
      viewBox="0 0 520 460"
      className="h-auto w-full max-w-lg"
      role="img"
      aria-label="تصویر اسناد و گزارش‌های مالی"
    >
      <defs>
        <linearGradient id="auth-sheet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--card))" />
          <stop offset="100%" stopColor="hsl(var(--card))" stopOpacity="0.88" />
        </linearGradient>
        <linearGradient id="auth-bar" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.55" />
          <stop offset="100%" stopColor="hsl(var(--accent))" />
        </linearGradient>
        <filter id="auth-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dy="10" stdDeviation="14" floodColor="hsl(226 40% 10%)" floodOpacity="0.18" />
        </filter>
      </defs>

      {/* حلقه‌های پس‌زمینه */}
      <circle cx="420" cy="90" r="120" fill="hsl(var(--primary))" opacity="0.1" />
      <circle cx="90" cy="380" r="90" fill="hsl(var(--accent))" opacity="0.12" />

      {/* برگه پشتی */}
      <g filter="url(#auth-shadow)" opacity="0.6">
        <rect x="118" y="52" width="250" height="320" rx="18" fill="url(#auth-sheet)" transform="rotate(-7 243 212)" />
      </g>

      {/* برگه اصلی */}
      <g filter="url(#auth-shadow)">
        <rect x="140" y="70" width="260" height="330" rx="18" fill="url(#auth-sheet)" />

        {/* سربرگ سند */}
        <rect x="166" y="100" width="108" height="11" rx="5.5" fill="hsl(var(--foreground))" opacity="0.75" />
        <rect x="166" y="121" width="64" height="8" rx="4" fill="hsl(var(--muted-foreground))" opacity="0.5" />
        <rect x="316" y="98" width="58" height="34" rx="9" fill="hsl(var(--primary))" opacity="0.14" />
        <path
          d="M332 115h26M345 107v16"
          stroke="hsl(var(--primary))"
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* ردیف‌های مبلغ */}
        {[0, 1, 2, 3].map((row) => (
          <g key={row} transform={`translate(0 ${row * 34})`}>
            <rect x="166" y="156" width="112" height="8" rx="4" fill="hsl(var(--muted-foreground))" opacity="0.32" />
            <rect x="296" y="156" width="78" height="8" rx="4" fill="hsl(var(--muted-foreground))" opacity="0.2" />
          </g>
        ))}

        {/* خط جمع و مبلغ نهایی */}
        <rect x="166" y="302" width="208" height="1.5" rx="0.75" fill="hsl(var(--border))" />
        <rect x="166" y="316" width="72" height="10" rx="5" fill="hsl(var(--foreground))" opacity="0.6" />
        <rect x="286" y="314" width="88" height="14" rx="7" fill="hsl(var(--primary))" opacity="0.85" />

        {/* مهر تأیید */}
        <circle cx="196" cy="360" r="17" fill="hsl(var(--success))" opacity="0.16" />
        <path
          d="M189 360l5 5 10-11"
          fill="none"
          stroke="hsl(var(--success))"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* کارت نمودار شناور */}
      <g filter="url(#auth-shadow)">
        <rect x="318" y="268" width="168" height="124" rx="16" fill="url(#auth-sheet)" />
        <rect x="338" y="288" width="54" height="7" rx="3.5" fill="hsl(var(--muted-foreground))" opacity="0.45" />
        {[
          { x: 338, h: 30 },
          { x: 364, h: 52 },
          { x: 390, h: 40 },
          { x: 416, h: 66 },
          { x: 442, h: 48 },
        ].map((bar) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={372 - bar.h}
            width="16"
            height={bar.h}
            rx="5"
            fill="url(#auth-bar)"
          />
        ))}
      </g>
    </svg>
  );
}
