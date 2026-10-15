import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { AppError, type ErrorDetail } from './app-error';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: readonly ErrorDetail[];
  traceId: string;
}

/**
 * فیلتر سراسری خطا.
 *
 * دو قاعده سخت (docs/10-security-plan.md §۸):
 *  - کاربر فقط پیام فارسی و `traceId` می‌بیند.
 *  - stack trace، نام جدول، کوئری و پیام خام دیتابیس **هرگز** به پاسخ نمی‌روند؛
 *    جزئیات فقط در log سروری با همان `traceId` ثبت می‌شود.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const traceId = (request.headers['x-trace-id'] as string | undefined) ?? randomTraceId();

    const body = this.toErrorBody(exception, traceId);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { traceId, path: request.url, method: request.method, err: exception },
        'خطای پیش‌بینی‌نشده سرور',
      );
    } else {
      this.logger.warn(
        { traceId, path: request.url, method: request.method, code: body.code },
        body.message,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorBody(exception: unknown, traceId: string): ErrorBody {
    if (exception instanceof AppError) {
      return {
        statusCode: exception.status,
        code: exception.code,
        message: exception.message,
        ...(exception.details ? { details: exception.details } : {}),
        traceId,
      };
    }

    if (exception instanceof ZodError) {
      return {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'VALIDATION_FAILED',
        message: 'اطلاعات ارسالی معتبر نیست',
        details: exception.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
        traceId,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return { ...this.fromPrisma(exception), traceId };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        statusCode: status,
        code: status === HttpStatus.NOT_FOUND ? 'NOT_FOUND' : 'HTTP_ERROR',
        message: status === HttpStatus.NOT_FOUND ? 'موردی یافت نشد' : exception.message,
        traceId,
      };
    }

    // هر چیز دیگر: پیام عمومی. جزئیات فقط در log.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'خطای غیرمنتظره‌ای رخ داد. در صورت تکرار با پشتیبانی تماس بگیرید.',
      traceId,
    };
  }

  /** ترجمه خطاهای دیتابیس به پیام فارسی، بدون افشای نام جدول یا ستون. */
  private fromPrisma(
    exception: Prisma.PrismaClientKnownRequestError,
  ): Omit<ErrorBody, 'traceId'> {
    switch (exception.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'UNIQUE_VIOLATION',
          message: 'رکوردی با همین مشخصات از قبل وجود دارد',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'FOREIGN_KEY_VIOLATION',
          message: 'این رکورد به اطلاعات دیگری وابسته است و عملیات ممکن نیست',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'موردی یافت نشد',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'DATABASE_ERROR',
          message: 'خطایی در پردازش اطلاعات رخ داد',
        };
    }
  }
}

function randomTraceId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
