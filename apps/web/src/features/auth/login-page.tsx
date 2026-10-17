import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Icon } from '../../shared/ui/icon';
import { cn } from '../../shared/ui/cn';
import { ApiError } from '../../shared/api/client';
import { DefaultMark } from '../organization/organization-mark';
import { AuthArtwork } from './auth-artwork';
import { useLogin } from './auth.api';

/**
 * همان قواعدی که سرور اعمال می‌کند.
 * Zod مشترک یعنی پیام و قاعده اعتبارسنجی در دو طرف واگرا نمی‌شوند.
 */
const loginSchema = z.object({
  username: z.string().trim().min(1, 'نام کاربری الزامی است').max(100),
  password: z.string().min(1, 'رمز عبور الزامی است').max(200),
});

type LoginForm = z.infer<typeof loginSchema>;

/** متن‌های چرخشی کنار تصویر — هر کدام یک قابلیت واقعی همین سامانه است. */
const SLIDES: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: 'محاسبه مالی بدون خطای گرد کردن',
    body: 'همه مبالغ ریال صحیح‌اند و در هیچ مرحله‌ای از مسیر، به عدد ممیز شناور تبدیل نمی‌شوند.',
  },
  {
    title: 'گزارش مالیات، آماده چاپ',
    body: 'قالب گزارش داده است نه کد؛ خروجی چاپ، Excel و PDF از همان یک قالب ساخته می‌شود.',
  },
  {
    title: 'هر دسترسی، سمت سرور بررسی می‌شود',
    body: 'پنهان بودن یک دکمه کنترل دسترسی نیست؛ هر مسیر مجوز اعلام‌شده و دامنه دسترسی دارد.',
  },
  {
    title: 'تاریخچه کامل تغییرات',
    body: 'هر عملیات حساس در حسابرسی ثبت می‌شود: چه کسی، چه زمانی و چه چیزی را عوض کرد.',
  },
];

const SLIDE_INTERVAL_MS = 6000;

export function LoginPage(): JSX.Element {
  const login = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await login.mutateAsync(values).catch(() => undefined);
  });

  const serverError =
    login.error instanceof ApiError
      ? login.error.message
      : login.error
        ? 'خطا در ارتباط با سرور'
        : null;

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* ───────────── فرم ورود ───────────── */}
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-[var(--animate-rise)]">
          <header className="mb-8 text-center">
            <DefaultMark size={56} className="mx-auto" />
            <h1 className="mt-4 text-xl font-bold">سامانه مدیریت اسناد کارپردازی</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">برای ادامه وارد شوید</p>
          </header>

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Input
              label="نام کاربری"
              required
              autoComplete="username"
              autoFocus
              error={errors.username?.message}
              {...register('username')}
            />

            <Input
              label="رمز عبور"
              type="password"
              required
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />

            {serverError ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
              >
                <Icon name="alert" className="mt-0.5 shrink-0" />
                <span>{serverError}</span>
              </p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={isSubmitting || login.isPending}
            >
              ورود
            </Button>
          </form>

          {/* عدد دقیق تلاش‌ها اینجا نوشته نمی‌شود: مقدارش تنظیم محیطی است و یک عدد
              ثابت در رابط، روزی با تنظیم واقعی سرور فرق می‌کند. */}
          <p className="mt-8 text-center text-xs leading-6 text-muted-foreground">
            پس از چند تلاش ناموفق پیاپی، حساب برای مدت کوتاهی قفل می‌شود.
          </p>
        </div>
      </main>

      {/* ───────────── نیمه تصویر ───────────── */}
      <aside className="relative hidden overflow-hidden bg-primary/5 lg:flex lg:flex-col lg:items-center lg:justify-center">
        {/* گرادیان زمینه — با رنگ اصلی تم عوض می‌شود. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.22),transparent_55%),radial-gradient(circle_at_75%_80%,hsl(var(--accent)/0.22),transparent_55%)]"
        />

        <div className="relative z-10 flex w-full max-w-xl flex-col items-center gap-10 p-10">
          <AuthArtwork />
          <TextSlider />
        </div>
      </aside>
    </div>
  );
}

/**
 * اسلایدر متن روی تصویر.
 *
 * سه نکته دسترس‌پذیری که یک اسلایدر معمولی ندارد:
 *  - ناحیه متن `aria-live="polite"` است تا تغییر اسلاید به صفحه‌خوان گفته شود.
 *  - چرخش با hover یا فوکوس **متوقف** می‌شود؛ متنی که زیر دست کاربر عوض شود،
 *    خواندنش ممکن نیست.
 *  - اگر کاربر در سیستمش «کاهش حرکت» را روشن کرده باشد، چرخش خودکار اصلاً شروع
 *    نمی‌شود و فقط دکمه‌های انتخاب می‌مانند.
 */
function TextSlider(): JSX.Element {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || paused) return;

    const timer = window.setInterval(
      () => setIndex((value) => (value + 1) % SLIDES.length),
      SLIDE_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [paused]);

  const slide = SLIDES[index] as (typeof SLIDES)[number];

  return (
    <div
      className="w-full text-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div aria-live="polite" className="min-h-28">
        <h2 key={`${index}-title`} className="text-lg font-bold animate-[var(--animate-rise)]">
          {slide.title}
        </h2>
        <p
          key={`${index}-body`}
          className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground animate-[var(--animate-fade-in)]"
        >
          {slide.body}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2">
        {SLIDES.map((item, slideIndex) => (
          <button
            key={item.title}
            type="button"
            onClick={() => setIndex(slideIndex)}
            aria-label={item.title}
            aria-current={slideIndex === index ? 'true' : undefined}
            className={cn(
              'h-2 rounded-full transition-all',
              slideIndex === index ? 'w-7 bg-primary' : 'w-2 bg-muted-foreground/35 hover:bg-muted-foreground/60',
            )}
          />
        ))}
      </div>
    </div>
  );
}
