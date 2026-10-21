/**
 * کد سه‌رقمی بانک‌های ایران در ساختار شبا.
 *
 * این **داده مرجع** است، نه منطق برنامه: تشخیص بانک از روی پیشوند شبا با جست‌وجو
 * در همین فهرست انجام می‌شود، پس افزودن یا تغییر بانک نیازی به تغییر کد ندارد.
 *
 * چرا در بستهٔ مشترک و نه در seed سرور: رابط کاربری هم باید **بدون رفت‌وبرگشت به
 * سرور** و حین تایپ بگوید شبا مال کدام بانک است؛ جدول بانک‌های پایگاه داده از همین
 * فهرست پر می‌شود، پس یک منبع حقیقت بیشتر وجود ندارد.
 *
 * یادآوری: تشخیص بانک **تأیید مالکیت یا فعال بودن حساب نیست**.
 */
export interface IranBank {
  readonly code: string;
  readonly titleFa: string;
}

export const IRAN_BANKS: readonly IranBank[] = [
  { code: '010', titleFa: 'بانک مرکزی جمهوری اسلامی ایران' },
  { code: '011', titleFa: 'بانک صنعت و معدن' },
  { code: '012', titleFa: 'بانک ملت' },
  { code: '013', titleFa: 'بانک رفاه کارگران' },
  { code: '014', titleFa: 'بانک مسکن' },
  { code: '015', titleFa: 'بانک سپه' },
  { code: '016', titleFa: 'بانک کشاورزی' },
  { code: '017', titleFa: 'بانک ملی ایران' },
  { code: '018', titleFa: 'بانک تجارت' },
  { code: '019', titleFa: 'بانک صادرات ایران' },
  { code: '020', titleFa: 'بانک توسعه صادرات ایران' },
  { code: '021', titleFa: 'پست بانک ایران' },
  { code: '022', titleFa: 'بانک توسعه تعاون' },
  { code: '051', titleFa: 'مؤسسه اعتباری توسعه' },
  { code: '052', titleFa: 'بانک قوامین' },
  { code: '053', titleFa: 'بانک کارآفرین' },
  { code: '054', titleFa: 'بانک پارسیان' },
  { code: '055', titleFa: 'بانک اقتصاد نوین' },
  { code: '056', titleFa: 'بانک سامان' },
  { code: '057', titleFa: 'بانک پاسارگاد' },
  { code: '058', titleFa: 'بانک سرمایه' },
  { code: '059', titleFa: 'بانک سینا' },
  { code: '060', titleFa: 'بانک مهر ایران' },
  { code: '061', titleFa: 'بانک شهر' },
  { code: '062', titleFa: 'بانک آینده' },
  { code: '063', titleFa: 'بانک انصار' },
  { code: '064', titleFa: 'بانک گردشگری' },
  { code: '065', titleFa: 'بانک حکمت ایرانیان' },
  { code: '066', titleFa: 'بانک دی' },
  { code: '069', titleFa: 'بانک ایران زمین' },
  { code: '070', titleFa: 'بانک رسالت' },
  { code: '073', titleFa: 'مؤسسه اعتباری کوثر' },
  { code: '075', titleFa: 'مؤسسه اعتباری ملل' },
  { code: '078', titleFa: 'بانک خاورمیانه' },
  { code: '080', titleFa: 'بانک نور' },
  { code: '090', titleFa: 'بانک مهر اقتصاد' },
  { code: '095', titleFa: 'مؤسسه اعتباری نور' },
];

const BY_CODE = new Map(IRAN_BANKS.map((bank) => [bank.code, bank]));

/** بانکِ یک کد سه‌رقمی، یا `null` اگر کد ناشناخته باشد. */
export function bankByCode(code: string | null | undefined): IranBank | null {
  if (!code) return null;
  return BY_CODE.get(code) ?? null;
}

/**
 * کد بانک از روی شبای ناقص.
 *
 * عمداً به شبای کامل نیاز ندارد: کد بانک در رقم‌های ۳ تا ۵ (پس از دو رقم کنترلی)
 * می‌نشیند، پس به‌محض تایپ پنجمین رقم می‌توان بانک را نشان داد و لازم نیست کاربر تا
 * رقم بیست‌وچهارم منتظر بماند.
 */
export function bankCodeFromDigits(digits: string): string | null {
  if (digits.length < 5) return null;
  return digits.slice(2, 5);
}
