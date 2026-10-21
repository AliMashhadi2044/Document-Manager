import type { SVGProps } from 'react';

/**
 * مجموعه آیکون‌های رابط — به‌صورت SVG درون بسته، نه از یک کتابخانه آیکون.
 *
 * دو دلیل:
 *
 *  ۱. **وابستگی کمتر.** یک کتابخانه آیکون برای بیست آیکون، هم وزن بسته را زیاد
 *     می‌کند و هم یک وابستگی دیگر برای نگهداری و `npm audit` اضافه می‌کند.
 *  ۲. **یکدستی.** همه این آیکون‌ها یک گرید ۲۴، یک ضخامت خط (۱٫۷۵) و یک سر خط
 *     گرد دارند. مخلوط کردن چند منبع آیکون، همان چیزی است که رابط را شلخته نشان
 *     می‌دهد.
 *
 * رنگ از `currentColor` می‌آید، پس آیکون با متنِ کنارش هم‌رنگ است و با تم عوض
 * می‌شود. اندازه پیش‌فرض ۱em است تا با اندازه متن مقیاس بگیرد.
 *
 * دسترس‌پذیری: آیکون‌ها تزئینی‌اند و `aria-hidden` دارند. آیکونی که **تنها**
 * محتوای یک دکمه است، معنایش از `aria-label` همان دکمه می‌آید، نه از SVG.
 */

export type IconName =
  | 'dashboard'
  | 'documents'
  | 'archive'
  | 'chart'
  | 'template'
  | 'info'
  | 'database'
  | 'layers'
  | 'store'
  | 'settings'
  | 'bell'
  | 'logout'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'palette'
  | 'search'
  | 'plus'
  | 'check'
  | 'close'
  | 'chevron-start'
  | 'chevron-end'
  | 'chevron-down'
  | 'menu'
  | 'upload'
  | 'download'
  | 'print'
  | 'file-excel'
  | 'file-pdf'
  | 'trash'
  | 'edit'
  | 'alert'
  | 'clock'
  | 'money'
  | 'trend-up'
  | 'users'
  | 'image'
  | 'pin'
  | 'pin-off'
  | 'arrow-up'
  | 'arrow-down'
  | 'sliders'
  | 'restore'
  | 'power'
  | 'grip'
  | 'more'
  | 'minus';

/** مسیرهای هر آیکون روی گرید ۲۴×۲۴. */
const PATHS: Record<IconName, readonly string[]> = {
  dashboard: ['M4 4h7v7H4z', 'M13 4h7v4h-7z', 'M13 10h7v10h-7z', 'M4 13h7v7H4z'],
  documents: ['M7 3h7l5 5v13H7z', 'M14 3v5h5', 'M10 13h6', 'M10 17h6'],
  archive: ['M3 6h18v4H3z', 'M5 10v10h14V10', 'M10 14h4'],
  chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M21 20H3'],
  template: ['M4 4h16v16H4z', 'M4 9h16', 'M9 9v11'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8h.01'],
  database: ['M12 7c4.4 0 8-1.1 8-2.5S16.4 2 12 2 4 3.1 4 4.5 7.6 7 12 7z', 'M20 4.5v15c0 1.4-3.6 2.5-8 2.5s-8-1.1-8-2.5v-15', 'M20 12c0 1.4-3.6 2.5-8 2.5S4 13.4 4 12'],
  layers: ['M12 3 3 8l9 5 9-5-9-5z', 'M3 14l9 5 9-5', 'M3 11l9 5 9-5'],
  store: ['M4 9h16v11H4z', 'M3 9l1.5-5h15L21 9', 'M9 20v-6h6v6'],
  settings: [
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    'M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 18.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  ],
  bell: ['M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  sun: [
    'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
    'M12 1v2',
    'M12 21v2',
    'M4.2 4.2l1.4 1.4',
    'M18.4 18.4l1.4 1.4',
    'M1 12h2',
    'M21 12h2',
    'M4.2 19.8l1.4-1.4',
    'M18.4 5.6l1.4-1.4',
  ],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  monitor: ['M3 4h18v12H3z', 'M8 20h8', 'M12 16v4'],
  palette: [
    'M12 21a9 9 0 1 1 0-18c4.97 0 9 3.58 9 8 0 2.21-1.79 4-4 4h-1.5a1.5 1.5 0 0 0-1.06 2.56A1.5 1.5 0 0 1 12 21z',
    'M7.5 11.5h.01',
    'M10.5 8h.01',
    'M14.5 8h.01',
  ],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  check: ['M20 6L9 17l-5-5'],
  close: ['M18 6L6 18', 'M6 6l12 12'],
  'chevron-start': ['M15 18l-6-6 6-6'],
  'chevron-end': ['M9 18l6-6-6-6'],
  'chevron-down': ['M6 9l6 6 6-6'],
  menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 9l5-5 5 5', 'M12 4v12'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  print: ['M6 9V3h12v6', 'M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2', 'M6 14h12v7H6z'],
  'file-excel': ['M7 3h7l5 5v13H7z', 'M14 3v5h5', 'M10 12l4 6', 'M14 12l-4 6'],
  'file-pdf': ['M7 3h7l5 5v13H7z', 'M14 3v5h5', 'M10 13h1.5a1.5 1.5 0 0 1 0 3H10v-3z', 'M10 16v2'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z'],
  alert: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9L2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  money: ['M3 6h18v12H3z', 'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M6 9h.01', 'M18 15h.01'],
  'trend-up': ['M3 17l6-6 4 4 7-7', 'M14 8h6v6'],
  users: ['M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M22 20v-2a4 4 0 0 0-3-3.9', 'M16 2.1a4 4 0 0 1 0 7.8'],
  image: ['M3 5h18v14H3z', 'M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M21 16l-5-5-6 6-3-3-4 4'],
  pin: ['M12 17v5', 'M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z'],
  'pin-off': ['M12 17v5', 'M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z', 'M3 3l18 18'],
  'arrow-up': ['M12 20V5', 'M6 11l6-6 6 6'],
  'arrow-down': ['M12 4v15', 'M6 13l6 6 6-6'],
  sliders: ['M4 7h10', 'M18 7h2', 'M4 17h4', 'M12 17h8', 'M16 5v4', 'M8 15v4'],
  restore: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5'],
  power: ['M12 3v9', 'M7.5 6.2a7.5 7.5 0 1 0 9 0'],
  more: ['M12 5h.01', 'M12 12h.01', 'M12 19h.01'],
  grip: ['M9 6h.01', 'M9 12h.01', 'M9 18h.01', 'M15 6h.01', 'M15 12h.01', 'M15 18h.01'],
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** اندازه بر حسب px؛ پیش‌فرض با اندازه متن مقیاس می‌گیرد. */
  size?: number;
}

export function Icon({ name, size, className, ...rest }: IconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size ?? '1.25em'}
      height={size ?? '1.25em'}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
