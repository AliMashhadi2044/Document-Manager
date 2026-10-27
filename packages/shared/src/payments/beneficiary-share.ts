/**
 * آیا پرداخت یک فاکتور به حساب **ذی‌نفع** می‌رود؟
 *
 * فرم ریزهزینه‌های جاری کنار هر ردیف یک خانهٔ تیک دارد: «این فاکتور به حساب ذی‌نفع
 * پرداخت شده؟». جواب همیشه بله/خیر نیست — پرداخت ترکیبی بخشی از فاکتور را به
 * ذی‌نفع می‌دهد و بخشی را به کارپرداز. تیکِ کامل برای چنین ردیفی، روی کاغذ یک
 * حرفِ نادرست است.
 *
 * پس سه حالت، و نه دو تا. خودِ **علامت** اینجا نیست و در قالب گزارش است: شکل تیک
 * یک تصمیم فرم است و نه قاعدهٔ مالی؛ همین تابع برای فرمی که علامت دیگری بخواهد هم
 * باید کار کند.
 */
export type BeneficiaryShareKind = 'FULL' | 'PARTIAL' | 'NONE';

/**
 * @param methodKind مقدار `invoice_payments.method_kind`؛ `null` یعنی فاکتور هنوز
 *   روش پرداخت ندارد — نه ذی‌نفع، نه چیز دیگر.
 */
export function beneficiaryShareKind(methodKind: string | null): BeneficiaryShareKind {
  if (methodKind === 'BENEFICIARY_ACCOUNT') return 'FULL';
  if (methodKind === 'SPLIT') return 'PARTIAL';
  return 'NONE';
}
