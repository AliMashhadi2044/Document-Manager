-- ردیف «گزارش مالی سامانه ستاد»، به‌ازای فاکتور یک سند ستادی.
--
-- مقدارها گزارشی‌اند و نه مالی: جمع سند را عوض نمی‌کنند. با پیش‌فرض ساخته می‌شوند
-- و `edited_fields` می‌گوید کاربر کدام را دست زده و دیگر بازحساب نمی‌شود.
CREATE TABLE "invoice_stad_report_lines" (
  "invoice_id"    UUID NOT NULL,
  "item_title"    VARCHAR(500) NOT NULL,
  "quantity"      INTEGER NOT NULL DEFAULT 1,
  "unit_amount"   BIGINT NOT NULL,
  "cash_amount"   BIGINT NOT NULL,
  "notes"         TEXT NOT NULL DEFAULT '',
  "edited_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updated_by_id" UUID,
  "updated_at"    TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "invoice_stad_report_lines_pkey" PRIMARY KEY ("invoice_id"),

  -- تعدادِ صفر یا منفی، مبلغ واحد را بی‌معنا می‌کند (تقسیم بر صفر).
  CONSTRAINT "invoice_stad_report_lines_quantity_check" CHECK ("quantity" >= 1),
  CONSTRAINT "invoice_stad_report_lines_cash_check" CHECK ("cash_amount" >= 0),
  CONSTRAINT "invoice_stad_report_lines_unit_check" CHECK ("unit_amount" >= 0)
);

ALTER TABLE "invoice_stad_report_lines"
  ADD CONSTRAINT "invoice_stad_report_lines_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_stad_report_lines"
  ADD CONSTRAINT "invoice_stad_report_lines_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
