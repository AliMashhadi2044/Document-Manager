/**
 * رجیستری فهرست‌های ساده اطلاعات پایه.
 *
 * هفت موجودیت با ساختار یکسان (عنوان، وضعیت فعال، ترتیب) وجود دارد. به‌جای نوشتن هفت
 * controller و سرویس تکراری، ساختارشان یک‌بار اینجا به‌صورت **داده** تعریف می‌شود.
 *
 * نکته مهم: این رجیستری فقط ساختار CRUD را توصیف می‌کند. هیچ **مقدار** داده‌ای (نام
 * انشعاب، نوع سوخت، …) اینجا نیست؛ آن‌ها در دیتابیس‌اند و کاربر مدیریتشان می‌کند
 * (الزام §۸ پرامپت: hardcode نکردن فهرست‌ها).
 */

/** نام مدل Prisma برای هر منبع. */
export const LOOKUP_RESOURCES = {
  'utility-types': {
    model: 'utilityType',
    titleFa: 'انواع انشعاب',
    /** جاهایی که این رکورد ممکن است استفاده شده باشد (برای جلوگیری از حذف). */
    usage: [
      { model: 'invoiceUtilityDetail', field: 'utilityTypeId', titleFa: 'فاکتور انشعابات' },
    ] as readonly UsageRef[],
  },
  'fuel-types': {
    model: 'fuelType',
    titleFa: 'انواع سوخت',
    usage: [
      { model: 'invoiceFuelDetail', field: 'fuelTypeId', titleFa: 'فاکتور سوخت' },
    ] as readonly UsageRef[],
  },
  'stad-request-types': {
    model: 'stadRequestType',
    titleFa: 'انواع درخواست سامانه ستاد',
    usage: [] as readonly UsageRef[],
  },
  'product-types': {
    model: 'productType',
    titleFa: 'انواع کالا',
    usage: [] as readonly UsageRef[],
  },
  'measurement-units': {
    model: 'measurementUnit',
    titleFa: 'واحدهای اندازه‌گیری',
    usage: [] as readonly UsageRef[],
  },
  'vehicle-types': {
    model: 'vehicleType',
    titleFa: 'انواع خودرو',
    usage: [
      { model: 'vehicle', field: 'vehicleTypeId', titleFa: 'خودرو' },
      { model: 'invoiceFuelDetail', field: 'vehicleTypeId', titleFa: 'فاکتور سوخت' },
    ] as readonly UsageRef[],
  },
  'districts': {
    model: 'district',
    titleFa: 'نواحی',
    usage: [
      { model: 'school', field: 'districtId', titleFa: 'مدرسه' },
      { model: 'invoiceUtilityDetail', field: 'districtId', titleFa: 'فاکتور انشعابات' },
    ] as readonly UsageRef[],
  },
} as const;

export type LookupResource = keyof typeof LOOKUP_RESOURCES;

export interface UsageRef {
  /** مدل Prisma که به این رکورد ارجاع می‌دهد. */
  readonly model: string;
  /** نام فیلد خارجی در آن مدل. */
  readonly field: string;
  /** عنوان فارسی برای پیام خطا. */
  readonly titleFa: string;
}

export function isLookupResource(value: string): value is LookupResource {
  return Object.prototype.hasOwnProperty.call(LOOKUP_RESOURCES, value);
}

export const LOOKUP_RESOURCE_KEYS = Object.keys(LOOKUP_RESOURCES) as LookupResource[];

/** ستون‌های مجاز برای مرتب‌سازی — فهرست سفید در برابر ورودی کاربر. */
export const LOOKUP_SORTABLE = ['title', 'sortOrder', 'createdAt', 'updatedAt'] as const;
