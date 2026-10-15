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

  // در production، کلید نشست نمونه به‌هیچ‌وجه پذیرفته نیست.
  if (result.data.NODE_ENV === 'production' && result.data.SESSION_SECRET.includes('dev_only')) {
    throw new Error('SESSION_SECRET نمونه در محیط production مجاز نیست');
  }

  return result.data;
}
