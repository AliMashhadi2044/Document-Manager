import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from './button';

/**
 * مرزِ خطای رندر.
 *
 * بدون این، یک خطای رندر در هر گوشه‌ای از رابط، کل صفحه را **سفید** می‌کند: نه
 * پیامی، نه دکمه‌ای، و کاربری که نمی‌داند باید رفرش کند. React از نسخهٔ ۱۶ درخت را
 * در چنین حالتی عمداً خالی می‌کند و تنها راهِ گرفتنش همین کامپوننت کلاسی است.
 *
 * `onReset` برای مرزهای درونی است: وقتی فقط یک بخش افتاده، پوسته سرِ جایش می‌ماند
 * و کاربر با یک کلیک به بخش دیگری می‌رود، بی‌آنکه کل برنامه بارگذاری دوباره شود.
 */

interface Props {
  readonly children: ReactNode;
  /** عنوان پیام؛ برای مرز بیرونی و درونی فرق می‌کند. */
  readonly title?: string;
  readonly onReset?: () => void;
}

interface State {
  readonly failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // تنها جایی که رد این خطا می‌ماند؛ بدون آن، گزارش کاربر «سفید شد» است و بس.
    console.error('خطای رندر', error, info.componentStack);
  }

  private readonly handleReset = (): void => {
    this.setState({ failed: false });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div
          role="alert"
          className="w-full max-w-md rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center"
        >
          <h2 className="text-sm font-semibold text-destructive">
            {this.props.title ?? 'این بخش باز نشد'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            خطایی در نمایش رخ داد. داده‌ای از بین نرفته است؛ می‌توانید دوباره تلاش کنید.
          </p>

          <div className="mt-5 flex items-center justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={this.handleReset}>
              تلاش دوباره
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
              بارگذاری دوباره صفحه
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
