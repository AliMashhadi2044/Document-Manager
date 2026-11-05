import { z } from 'zod';

/**
 * اعتبارسنجی تنظیمات محیطی در bootstrap.
 *
 * قاعده: برنامه با تنظیم ناقص **بالا نمی‌آید** (fail fast)، به‌جای اینکه با مقدار
 * پیش‌فرض ناامن اجرا شود (docs/10-security-plan.md §۷).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL الزامی است'),

  // کلید نشست باید به‌اندازه کافی طولانی باشد؛ مقدار کوتاه در production پذیرفته نیست.
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET باید حداقل ۳۲ نویسه باشد'),
  SESSION_ABSOLUTE_TTL_MINUTES: z.coerce.number().int().positive().default(720),
  SESSION_IDLE_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),

  /**
   * نگهداشت داده (روز).
   *
   * فقط اعلان‌های **خوانده‌شده** و رویدادهای امنیتی پاک می‌شوند. ردپای حسابرسی
   * (`audit_logs`) هیچ‌وقت خودکار پاک نمی‌شود؛ آن را باید آرشیو کرد، نه حذف.
   */
  NOTIFICATION_RETENTION_DAYS: z.coerce.number().int().min(7).default(180),
  SECURITY_EVENT_RETENTION_DAYS: z.coerce.number().int().min(30).default(365),

  /**
   * سقف نرخ درخواست بر پایهٔ نشانی شبکه.
   *
   * جدا از `LOGIN_MAX_ATTEMPTS` است و کار دیگری می‌کند: آن یک **حساب** را پس از
   * چند تلاش ناموفق قفل می‌کند، این جلوی پخش کردنِ تلاش روی نام‌های کاربری مختلف
   * از یک نشانی را می‌گیرد.
   *
   * قابل تنظیم است چون در آزمون E2E ده‌ها ورود پشت سر هم از یک نشانی انجام
   * می‌شود و سقف واقعی آنجا معنا ندارد.
   */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  AUTH_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(5),
  /**
   * سقف عمومی، به‌ازای هر نشانی در دقیقه.
   *
   * عدد بالاست و عمداً: این سقف برای **سیل درخواست** است، نه تنظیم ظریفِ سهم
   * کاربران. اگر سرویس پشت proxy باشد و `TRUST_PROXY` خاموش بماند، کل اداره یک
   * نشانی دیده می‌شود و همین عدد باید جا داشته باشد.
   */
  GENERAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1_200),

  /**
   * آیا سرویس پشت یک proxy معکوس (nginx و مانندش) است؟
   *
   * بدون این، `request.ip` نشانی خودِ proxy است و سقف نرخ، همهٔ کاربران را یک
   * نفر می‌بیند. با `true`، هدر `X-Forwarded-For` باور می‌شود — پس فقط وقتی که
   * واقعاً proxy جلوی سرویس است، وگرنه هر کسی می‌تواند نشانی‌اش را جعل کند.
   */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('dm-documents'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  /**
   * مرز «خروجی حجیم»: بیشتر از این تعداد ردیف به صف می‌رود.
   *
   * قابل تنظیم است چون روی ماشین توسعه باید **هر دو مسیر** (هم‌زمان و صف‌شده) قابل
   * آزمون باشند، و داده توسعه هیچ‌وقت به هزاران ردیف نمی‌رسد.
   */
  EXPORT_SYNC_ROW_LIMIT: z.coerce.number().int().min(1).max(100_000).default(2_000),

  /** عمر لینک دانلود خروجی صف‌شده (ساعت). */
  EXPORT_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),

  /**
   * شمارنده کوئری هر درخواست (هدر `X-Query-Count`) — ابزار تشخیصی برای اثبات نبودِ
   * N+1. در production حتی با `true` روشن نمی‌شود؛ بررسی‌اش در `query-counter.ts`
   * است و این فقط اعلام متغیر است تا تنظیم ناشناخته بی‌صدا نماند.
   */
  EXPOSE_QUERY_COUNT: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`تنظیمات محیطی نامعتبر است:\n${problems}`);
  }

  // شمارنده کوئری در production هرگز روشن نمی‌شود؛ تنظیم اشتباه باید **صدا** کند،
  // نه اینکه بی‌صدا نادیده گرفته شود.
  if (result.data.NODE_ENV === 'production' && result.data.EXPOSE_QUERY_COUNT) {
    throw new Error('EXPOSE_QUERY_COUNT در محیط production مجاز نیست');
  }

  // در production، کلید نشست نمونه به‌هیچ‌وجه پذیرفته نیست.
  if (result.data.NODE_ENV === 'production' && result.data.SESSION_SECRET.includes('dev_only')) {
    throw new Error('SESSION_SECRET نمونه در محیط production مجاز نیست');
  }

  return result.data;
}
