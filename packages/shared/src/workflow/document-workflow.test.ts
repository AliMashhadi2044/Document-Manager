import { describe, expect, it } from 'vitest';

import {
  availableActions,
  canTransition,
  findTransition,
  isCorrectableField,
  isEditableStatus,
  TRANSITIONS,
} from './document-workflow';
import { DOCUMENT_STATUSES, type DocumentStatus } from '../enums/enums';
import { DEFAULT_ROLE_PERMISSIONS } from '../enums/permissions';

describe('انتقال‌های مجاز', () => {
  it('ثبت نهایی از پیش‌نویس مجاز است', () => {
    expect(canTransition('FINALIZE', 'DRAFT')).toBe(true);
  });

  it('ثبت نهایی از بازگشایی‌شده مجاز است', () => {
    expect(canTransition('FINALIZE', 'REOPENED')).toBe(true);
  });

  it('ارجاع به بایگانی فقط از ثبت‌شده مجاز است', () => {
    expect(canTransition('SEND_TO_ARCHIVE', 'FINALIZED')).toBe(true);
    expect(canTransition('SEND_TO_ARCHIVE', 'DRAFT')).toBe(false);
  });

  it('نهایی کردن بایگانی فقط از در انتظار بایگانی مجاز است', () => {
    expect(canTransition('ARCHIVE', 'PENDING_ARCHIVE')).toBe(true);
    expect(canTransition('ARCHIVE', 'FINALIZED')).toBe(false);
  });
});

describe('انتقال‌های غیرمجاز — عمداً وجود ندارند', () => {
  it('بایگانی‌شده مستقیم به پیش‌نویس برنمی‌گردد', () => {
    const toDraft = TRANSITIONS.filter((rule) => rule.to === 'DRAFT');
    expect(toDraft).toHaveLength(0);
  });

  it('ثبت نهایی از وضعیت بایگانی‌شده مستقیماً ممکن نیست', () => {
    expect(canTransition('FINALIZE', 'ARCHIVED')).toBe(false);
  });

  it('بازگشایی از پیش‌نویس بی‌معنا و غیرمجاز است', () => {
    expect(canTransition('REOPEN', 'DRAFT')).toBe(false);
  });
});

describe('تصمیم Q7 — بازگشایی سند بایگانی‌شده', () => {
  it('از هر سه وضعیت پس از ثبت، بازگشایی مجاز است', () => {
    expect(canTransition('REOPEN', 'FINALIZED')).toBe(true);
    expect(canTransition('REOPEN', 'PENDING_ARCHIVE')).toBe(true);
    expect(canTransition('REOPEN', 'ARCHIVED')).toBe(true);
  });

  it('بازگشایی دلیل الزامی دارد و نسخه می‌سازد', () => {
    const rule = findTransition('REOPEN', 'ARCHIVED');
    expect(rule?.requiresReason).toBe(true);
    expect(rule?.createsRevision).toBe(true);
  });
});

describe('قواعد نسخه و دلیل', () => {
  it('ثبت نهایی نسخه می‌سازد ولی دلیل نمی‌خواهد', () => {
    const rule = findTransition('FINALIZE', 'DRAFT');
    expect(rule?.createsRevision).toBe(true);
    expect(rule?.requiresReason).toBe(false);
  });

  it('ارجاع برای اصلاح دلیل الزامی دارد', () => {
    const rule = findTransition('SEND_BACK_FOR_REVISION', 'FINALIZED');
    expect(rule?.requiresReason).toBe(true);
  });
});

describe('وضعیت‌های قابل ویرایش', () => {
  it('فقط پیش‌نویس و بازگشایی‌شده قابل ویرایش مالی‌اند', () => {
    const editable = DOCUMENT_STATUSES.filter((status: DocumentStatus) => isEditableStatus(status));
    expect(editable).toEqual(['DRAFT', 'REOPENED']);
  });
});

describe('اقدامات مجاز بر اساس نقش', () => {
  it('کارپردازی می‌تواند سند پیش‌نویس را ثبت نهایی کند', () => {
    const actions = availableActions('DRAFT', DEFAULT_ROLE_PERMISSIONS.PROCUREMENT);
    expect(actions.map((rule) => rule.action)).toContain('FINALIZE');
  });

  it('کارپردازی نمی‌تواند بایگانی را نهایی کند — تفکیک وظایف', () => {
    const actions = availableActions('PENDING_ARCHIVE', DEFAULT_ROLE_PERMISSIONS.PROCUREMENT);
    expect(actions.map((rule) => rule.action)).not.toContain('ARCHIVE');
  });

  it('بایگانی می‌تواند بایگانی را نهایی کند ولی ثبت نهایی سند را نه', () => {
    const archiveActions = availableActions('PENDING_ARCHIVE', DEFAULT_ROLE_PERMISSIONS.ARCHIVIST);
    expect(archiveActions.map((rule) => rule.action)).toContain('ARCHIVE');

    const draftActions = availableActions('DRAFT', DEFAULT_ROLE_PERMISSIONS.ARCHIVIST);
    expect(draftActions.map((rule) => rule.action)).not.toContain('FINALIZE');
  });

  it('ناظر فقط می‌تواند برای اصلاح ارجاع دهد', () => {
    const actions = availableActions('FINALIZED', DEFAULT_ROLE_PERMISSIONS.SUPERVISOR);
    expect(actions.map((rule) => rule.action)).toEqual(['SEND_BACK_FOR_REVISION']);
  });

  it('ناظر هیچ اقدام تغییر مالی ندارد', () => {
    for (const status of DOCUMENT_STATUSES) {
      const actions = availableActions(status, DEFAULT_ROLE_PERMISSIONS.SUPERVISOR);
      expect(actions.map((rule) => rule.action)).not.toContain('FINALIZE');
      expect(actions.map((rule) => rule.action)).not.toContain('REOPEN');
      expect(actions.map((rule) => rule.action)).not.toContain('ARCHIVE');
    }
  });
});

describe('فیلدهای قابل اصلاح کنترل‌شده', () => {
  it('فیلدهای توصیفی مجازند', () => {
    expect(isCorrectableField('document.title')).toBe(true);
    expect(isCorrectableField('invoice.notes')).toBe(true);
    expect(isCorrectableField('document.stad.needNumber')).toBe(true);
  });

  it('هیچ فیلد مالی با اصلاح کنترل‌شده قابل تغییر نیست', () => {
    const financialFields = [
      'invoice.gross',
      'invoice.discount',
      'invoice.net',
      'invoice.tax',
      'invoice.total',
      'invoiceItem.unitPrice',
      'invoiceItem.quantity',
      'invoice.invoiceDate',
      'invoice.vendorId',
      'invoice.chapterId',
      'document.type',
      'document.documentNumber',
    ];
    for (const field of financialFields) {
      expect(isCorrectableField(field)).toBe(false);
    }
  });
});
