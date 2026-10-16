/**
 * تنظیمات محیطی ساختگی برای آزمون واحد.
 *
 * چرا لازم است: دو تست امنیتی (`permission-coverage`، `role-separation`) گراف ماژول
 * را از `AppModule` می‌خوانند تا هیچ endpoint بدون مجوز از قلم نیفتد. همین import
 * باعث اجرای `ConfigModule.forRoot` و اعتبارسنجی محیط می‌شود و بدون این مقادیر یک
 * rejection مدیریت‌نشده تولید می‌کند. تا پیش از ارتقای vitest، آن rejection بی‌صدا
 * بلعیده می‌شد؛ حالا گزارش می‌شود — و Node هم می‌تواند آن را کشنده کند.
 *
 * این مقادیر **ساختگی و بی‌کار** هستند: هیچ اتصالی با آن‌ها برقرار نمی‌شود (این
 * تست‌ها فقط metadata می‌خوانند) و هیچ‌کدام رمز یا کلید واقعی نیستند. مقدار موجود
 * در محیط هرگز بازنویسی نمی‌شود.
 */
const TEST_ENV: Readonly<Record<string, string>> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://unit-test@127.0.0.1:1/unit-test',
  // تنها شرط، طول ≥۳۲ نویسه است؛ این رشته امضای هیچ نشستی را تولید نمی‌کند.
  SESSION_SECRET: 'unit-test-not-a-real-secret-0000000000',
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] ??= value;
}
