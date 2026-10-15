/**
 * ماشین وضعیت سند (docs/07-document-workflow.md §۳).
 *
 * این جدول **داده** است، نه نثر: سرور آن را اجبار می‌کند، UI اقدامات مجاز را از آن
 * می‌سازد، و تست‌ها از همین منبع می‌خوانند. بنابراین سه‌جا هرگز واگرا نمی‌شوند.
 */

import type { DocumentStatus } from '../enums/enums';
import type { Permission } from '../enums/permissions';

export const WORKFLOW_ACTIONS = [
  'FINALIZE',
  'SEND_TO_ARCHIVE',
  'ARCHIVE',
  'SEND_BACK_FOR_REVISION',
  'REOPEN',
] as const;
export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

export interface TransitionRule {
  readonly action: WorkflowAction;
  readonly labelFa: string;
  readonly from: readonly DocumentStatus[];
  readonly to: DocumentStatus;
  readonly permission: Permission;
  /** ثبت دلیل الزامی است؟ */
  readonly requiresReason: boolean;
  /** نسخه کامل سند پیش از انتقال ثبت شود؟ */
  readonly createsRevision: boolean;
}

export const TRANSITIONS: readonly TransitionRule[] = [
  {
    action: 'FINALIZE',
    labelFa: 'ثبت نهایی',
    from: ['DRAFT', 'REOPENED', 'NEEDS_REVISION'],
    to: 'FINALIZED',
    permission: 'document:finalize',
    requiresReason: false,
    createsRevision: true,
  },
  {
    action: 'SEND_TO_ARCHIVE',
    labelFa: 'ارجاع به بایگانی',
    from: ['FINALIZED'],
    to: 'PENDING_ARCHIVE',
    permission: 'document:send_to_archive',
    requiresReason: false,
    createsRevision: false,
  },
  {
    action: 'ARCHIVE',
    labelFa: 'نهایی کردن بایگانی',
    from: ['PENDING_ARCHIVE'],
    to: 'ARCHIVED',
    permission: 'archive:write',
    requiresReason: false,
    createsRevision: true,
  },
  {
    action: 'SEND_BACK_FOR_REVISION',
    labelFa: 'ارجاع برای اصلاح',
    from: ['FINALIZED', 'PENDING_ARCHIVE', 'ARCHIVED'],
    to: 'NEEDS_REVISION',
    permission: 'feedback:create',
    requiresReason: true,
    createsRevision: false,
  },
  {
    // تصمیم Q6: کارپردازی خودش بازگشایی می‌کند، بدون مرحله تأیید جداگانه.
    // تصمیم Q7: سند بایگانی‌شده هم قابل بازگشایی است و باید دوباره بایگانی شود.
    action: 'REOPEN',
    labelFa: 'بازگشایی سند',
    from: ['FINALIZED', 'PENDING_ARCHIVE', 'ARCHIVED', 'NEEDS_REVISION'],
    to: 'REOPENED',
    permission: 'document:reopen',
    requiresReason: true,
    createsRevision: true,
  },
];

/** وضعیت‌هایی که در آن‌ها ویرایش کامل مالی مجاز است. */
export const EDITABLE_STATUSES: readonly DocumentStatus[] = ['DRAFT', 'REOPENED'];

export function isEditableStatus(status: DocumentStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function findTransition(
  action: WorkflowAction,
  from: DocumentStatus,
): TransitionRule | null {
  return TRANSITIONS.find((rule) => rule.action === action && rule.from.includes(from)) ?? null;
}

export function canTransition(action: WorkflowAction, from: DocumentStatus): boolean {
  return findTransition(action, from) !== null;
}

/** اقدامات مجاز برای یک وضعیت و مجموعه مجوزهای کاربر. */
export function availableActions(
  from: DocumentStatus,
  permissions: readonly Permission[],
): readonly TransitionRule[] {
  return TRANSITIONS.filter(
    (rule) => rule.from.includes(from) && permissions.includes(rule.permission),
  );
}

/**
 * فیلدهایی که با «اصلاح کنترل‌شده» قابل تغییرند (docs/07 §۵).
 * هر فیلد مالی عمداً بیرون است؛ تغییر آن‌ها فقط از مسیر بازگشایی ممکن است.
 */
export const CORRECTABLE_FIELDS: readonly string[] = [
  'document.title',
  'document.stad.needNumber',
  'document.stad.workflowNumber',
  'document.stad.requestNumber',
  'document.stad.requestTypeId',
  'document.stad.notes',
  'invoice.notes',
  'invoice.invoiceNumber',
  'payment.paymentIdentifier',
  'payment.billIdentifier',
  'payment.vendorBankAccountId',
  'archive.notes',
  'report.productTypeId',
];

export function isCorrectableField(field: string): boolean {
  return CORRECTABLE_FIELDS.includes(field);
}
