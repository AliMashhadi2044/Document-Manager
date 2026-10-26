/**
 * نقش‌های امضا در خروجی‌ها.
 *
 * قالب گزارش فقط همین کلید را نگه می‌دارد و نام و سمت در لحظهٔ تولید خروجی از
 * اطلاعات پایه خوانده می‌شوند؛ پس کلید باید پایدار بماند حتی وقتی شخص عوض می‌شود.
 *
 * `OTHER` برای امضاهایی است که در این فهرست جا نمی‌شوند (ناظر، نمایندهٔ مالی)؛ عنوان
 * واقعی‌شان را «سمت» همان امضاکننده می‌گوید.
 */
export const SIGNATORY_ROLE_KEYS = [
  'PROCUREMENT_LEAD',
  'REVIEW_LEAD',
  'GENERAL_MANAGER',
  'OTHER',
] as const;

export type SignatoryRoleKey = (typeof SIGNATORY_ROLE_KEYS)[number];

export const SIGNATORY_ROLE_LABELS: Record<SignatoryRoleKey, string> = {
  PROCUREMENT_LEAD: 'مسئول کارپردازی',
  REVIEW_LEAD: 'مسئول رسیدگی',
  GENERAL_MANAGER: 'مدیرکل',
  OTHER: 'سایر',
};
