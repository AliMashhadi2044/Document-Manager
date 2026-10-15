import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/**
 * ثبت تاریخچه تغییرات.
 *
 * دو قاعده (docs/10-security-plan.md §۸):
 *  - فیلدهای حساس هرگز وارد `before`/`after` نمی‌شوند.
 *  - ثبت audit داخل **همان تراکنش** عملیات انجام می‌شود، وگرنه ممکن است عملیات موفق
 *    شود ولی ردپایش گم شود.
 */

/** فیلدهایی که هرگز در audit ثبت نمی‌شوند. */
const REDACTED_FIELDS = new Set([
  'passwordHash',
  'password',
  'tokenHash',
  'csrfTokenHash',
  'token',
  'secret',
]);

export interface AuditInput {
  readonly actorId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly documentId?: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly reason?: string | null;
  readonly ip?: string | null;
  readonly traceId?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ثبت یک رویداد. در صورت ارائه `tx`، داخل همان تراکنش نوشته می‌شود.
   */
  async record(input: AuditInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;

    const before = sanitize(input.before);
    const after = sanitize(input.after);
    const changedFields = diffFields(before, after);

    try {
      await client.auditLog.create({
        data: {
          actorId: input.actorId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          documentId: input.documentId ?? null,
          before: (before ?? null) as Prisma.InputJsonValue,
          after: (after ?? null) as Prisma.InputJsonValue,
          changedFields,
          reason: input.reason ?? null,
          ip: input.ip ?? null,
          traceId: input.traceId ?? null,
        },
      });
    } catch (error) {
      // داخل تراکنش، خطا باید بالا برود تا عملیات بدون ردپا ثبت نشود.
      if (tx) throw error;
      this.logger.error({ err: error, action: input.action }, 'ثبت audit ناموفق بود');
    }
  }
}

/** حذف فیلدهای حساس و تبدیل مقادیر غیرقابل سریالایز. */
export function sanitize(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || typeof value !== 'object') return null;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(source)) {
    if (REDACTED_FIELDS.has(key)) continue;
    if (item instanceof Date) {
      result[key] = item.toISOString();
    } else if (typeof item === 'bigint') {
      result[key] = item.toString();
    } else if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      result[key] = sanitize(item);
    } else {
      result[key] = item;
    }
  }

  return result;
}

/** نام فیلدهایی که مقدارشان تغییر کرده است. */
export function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  if (!before || !after) return [];

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];

  for (const key of keys) {
    // زمان به‌روزرسانی خودکار، تغییر معناداری نیست.
    if (key === 'updatedAt' || key === 'createdAt') continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.push(key);
    }
  }

  return changed.sort();
}
