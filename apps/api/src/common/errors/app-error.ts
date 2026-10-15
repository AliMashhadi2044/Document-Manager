import { HttpStatus } from '@nestjs/common';

/**
 * خطای ساختاریافته دامنه.
 *
 * پیام **فارسی و قابل نمایش** است؛ stack trace، نام جدول، کوئری و پیام دیتابیس
 * هرگز به کاربر نمی‌رسند (docs/10-security-plan.md §۸).
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = HttpStatus.BAD_REQUEST,
    readonly details?: readonly ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }

  static unauthorized(message = 'برای انجام این عملیات باید وارد شوید'): AppError {
    return new AppError('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(message = 'شما مجوز انجام این عملیات را ندارید'): AppError {
    return new AppError('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }

  /**
   * برای رکورد خارج از دامنه دسترسی هم همین استفاده می‌شود (نه ۴۰۳)، تا وجود رکورد
   * لو نرود — ضد IDOR (docs/06-roles-permissions.md §۴).
   */
  static notFound(message = 'موردی یافت نشد'): AppError {
    return new AppError('NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }

  static validation(message: string, details?: readonly ErrorDetail[]): AppError {
    return new AppError('VALIDATION_FAILED', message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }

  static conflict(code: string, message: string): AppError {
    return new AppError(code, message, HttpStatus.CONFLICT);
  }

  static tooManyRequests(message: string): AppError {
    return new AppError('TOO_MANY_REQUESTS', message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export interface ErrorDetail {
  /** مسیر فیلد، مثل `invoices.0.items.2.taxAmount` */
  readonly path: string;
  readonly message: string;
  readonly expected?: string;
  readonly actual?: string;
}
