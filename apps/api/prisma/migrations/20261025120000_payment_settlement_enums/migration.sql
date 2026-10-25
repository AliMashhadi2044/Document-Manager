-- وضعیت پرداخت سند و اعلان‌های پیگیری آن.
--
-- enumها جدا از ستون‌ها، چون PostgreSQL اجازه نمی‌دهد مقدار تازهٔ یک enum در همان
-- تراکنشی که اضافه شده به‌کار رود — و مهاجرت بعدی در قید CHECK به این مقدارها
-- اشاره می‌کند.

CREATE TYPE "payment_settlement_status" AS ENUM ('FULLY_PAID', 'OUTSTANDING');

ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'DOCUMENT_PAYMENT_OUTSTANDING';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'DOCUMENT_PAYMENT_SETTLED';
