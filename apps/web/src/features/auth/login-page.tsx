import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { ApiError } from '../../shared/api/client';
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
    login.error instanceof ApiError ? login.error.message : login.error ? 'خطا در ارتباط با سرور' : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <header className="mb-6 text-center">
          <h1 className="text-lg font-bold">سامانه مدیریت اسناد کارپردازی</h1>
          <p className="mt-1 text-sm text-muted-foreground">برای ادامه وارد شوید</p>
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
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </p>
          ) : null}

          <Button type="submit" className="w-full" loading={isSubmitting || login.isPending}>
            ورود
          </Button>
        </form>
      </div>
    </main>
  );
}
