/**
 * مجوزها (docs/06-roles-permissions.md).
 *
 * فهرست در کد است تا تایپ‌شده و قابل بازبینی باشد؛ **تخصیص** به نقش‌ها داده است و از
 * رابط مدیریت کاربران قابل تغییر. UI هرگز مرجع کنترل دسترسی نیست.
 */

export const PERMISSIONS = [
  'document:read',
  'document:read_draft',
  'document:create',
  'document:update',
  'document:delete',
  'document:finalize',
  'document:correct',
  'document:reopen',
  'document:send_to_archive',
  'document:read_history',

  'invoice:create',
  'invoice:update',
  'invoice:delete',
  'invoice:read_calc_details',

  'vendor:read',
  'vendor:write',
  'vendor_bank_account:write',

  'buyer:read',
  'buyer:write',

  'base_data:read',
  'base_data:write',
  'financial_settings:write',

  'archive:read',
  'archive:write',

  'attachment:read',
  'attachment:upload',
  'attachment:delete',

  'feedback:read',
  'feedback:create',
  'feedback:reply',
  'feedback:resolve',

  'report:run',
  'report:export',
  'report:read_history',
  'report_template:read',
  'report_template:write',
  'report_template:publish',

  'user:read',
  'user:write',
  'role:write',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  'document:read': 'مشاهده سند',
  'document:read_draft': 'مشاهده اسناد پیش‌نویس',
  'document:create': 'ایجاد سند',
  'document:update': 'ویرایش سند',
  'document:delete': 'حذف سند پیش‌نویس',
  'document:finalize': 'ثبت نهایی سند',
  'document:correct': 'اصلاح کنترل‌شده سند',
  'document:reopen': 'بازگشایی سند',
  'document:send_to_archive': 'ارجاع به بایگانی',
  'document:read_history': 'مشاهده تاریخچه تغییرات',

  'invoice:create': 'ایجاد فاکتور',
  'invoice:update': 'ویرایش فاکتور',
  'invoice:delete': 'حذف فاکتور',
  'invoice:read_calc_details': 'مشاهده جزئیات محاسبات',

  'vendor:read': 'مشاهده فروشندگان',
  'vendor:write': 'مدیریت فروشندگان',
  'vendor_bank_account:write': 'مدیریت شباهای فروشنده',

  'buyer:read': 'مشاهده مجموعه‌های خریدار',
  'buyer:write': 'مدیریت مجموعه‌های خریدار',

  'base_data:read': 'مشاهده اطلاعات پایه',
  'base_data:write': 'مدیریت اطلاعات پایه',
  'financial_settings:write': 'مدیریت تنظیمات مالی',

  'archive:read': 'مشاهده کارتابل بایگانی',
  'archive:write': 'ثبت اطلاعات بایگانی',

  'attachment:read': 'مشاهده فایل‌ها',
  'attachment:upload': 'بارگذاری فایل',
  'attachment:delete': 'حذف فایل',

  'feedback:read': 'مشاهده بازخوردها',
  'feedback:create': 'ثبت بازخورد',
  'feedback:reply': 'پاسخ به بازخورد',
  'feedback:resolve': 'تغییر وضعیت رسیدگی',

  'report:run': 'اجرای گزارش',
  'report:export': 'دانلود خروجی',
  'report:read_history': 'تاریخچه تولید خروجی‌ها',
  'report_template:read': 'مشاهده قالب‌های گزارش',
  'report_template:write': 'ویرایش قالب‌های گزارش',
  'report_template:publish': 'انتشار قالب گزارش',

  'user:read': 'مشاهده کاربران',
  'user:write': 'مدیریت کاربران',
  'role:write': 'مدیریت نقش‌ها',
  'audit:read': 'مشاهده رویدادهای سامانه',
};

export const ROLE_KEYS = ['PROCUREMENT', 'ARCHIVIST', 'SUPERVISOR', 'SYSTEM_ADMIN'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  PROCUREMENT: 'کارپردازی',
  ARCHIVIST: 'بایگانی اسناد',
  SUPERVISOR: 'ناظر',
  SYSTEM_ADMIN: 'مدیر سامانه',
};

/**
 * ماتریس پیش‌فرض نقش‌ها.
 *
 * نکته‌های عمدی (تصمیم D9 و §۶ پرامپت):
 *  - کارپردازی `archive:write` و `attachment:upload` **ندارد** — تفکیک وظایف بایگانی.
 *  - کارپردازی `feedback:create` **ندارد** — ثبت بازخورد کار ناظر است.
 *  - مدیریت کاربران و نقش‌ها به نقش جدای «مدیر سامانه» داده شده است.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  PROCUREMENT: [
    'document:read',
    'document:read_draft',
    'document:create',
    'document:update',
    'document:delete',
    'document:finalize',
    'document:correct',
    'document:reopen',
    'document:send_to_archive',
    'document:read_history',
    'invoice:create',
    'invoice:update',
    'invoice:delete',
    'invoice:read_calc_details',
    'vendor:read',
    'vendor:write',
    'vendor_bank_account:write',
    'buyer:read',
    'buyer:write',
    'base_data:read',
    'base_data:write',
    'financial_settings:write',
    'archive:read',
    'attachment:read',
    'feedback:read',
    'feedback:reply',
    'feedback:resolve',
    'report:run',
    'report:export',
    'report:read_history',
    'report_template:read',
    'report_template:write',
    'report_template:publish',
    'audit:read',
  ],
  ARCHIVIST: [
    'document:read',
    'document:read_history',
    'base_data:read',
    'archive:read',
    'archive:write',
    'attachment:read',
    'attachment:upload',
    'attachment:delete',
    'feedback:read',
    'report:run',
    'report:export',
  ],
  SUPERVISOR: [
    'document:read',
    'document:read_history',
    'invoice:read_calc_details',
    'vendor:read',
    'buyer:read',
    'base_data:read',
    'archive:read',
    'attachment:read',
    'feedback:read',
    'feedback:create',
    'report:run',
    'report:export',
  ],
  SYSTEM_ADMIN: ['user:read', 'user:write', 'role:write', 'audit:read', 'base_data:read'],
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
