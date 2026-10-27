-- شرحِ یک فاکتور روی فرم ریزهزینه.
--
-- جدا از `invoices.description` است چون آن، حقیقتِ تاریخیِ سند است: چیزی که موقع
-- ثبت نوشته شده و در بازبینی به آن استناد می‌شود. عبارتی که روی فرم ریزهزینه
-- می‌نشیند یک تصمیم گزارش است و نه اصلاح سند.

CREATE TABLE "invoice_report_titles" (
  "invoice_id"      UUID PRIMARY KEY,
  "product_type_id" UUID,
  "custom_title"    VARCHAR(500),
  "set_by"          UUID NOT NULL,
  "set_at"          TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

  CONSTRAINT "invoice_report_titles_invoice_fk"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE,
  CONSTRAINT "invoice_report_titles_product_type_fk"
    FOREIGN KEY ("product_type_id") REFERENCES "product_types"("id") ON DELETE RESTRICT,
  CONSTRAINT "invoice_report_titles_set_by_fk"
    FOREIGN KEY ("set_by") REFERENCES "users"("id") ON DELETE CASCADE,

  -- دقیقاً یکی از دو منبع عنوان: یا یکی از انواع تعریف‌شده، یا متنی که کاربر نوشته.
  -- هر دو با هم یعنی دو حقیقت برای یک خانه، و هیچ‌کدام یعنی ردیفی که وجودش بی‌اثر
  -- است و فقط پیش‌فرض را پنهان می‌کند.
  CONSTRAINT "invoice_report_titles_source_ck" CHECK (
    ("product_type_id" IS NOT NULL AND "custom_title" IS NULL)
    OR ("product_type_id" IS NULL AND "custom_title" IS NOT NULL AND btrim("custom_title") <> '')
  )
);

CREATE INDEX "invoice_report_titles_product_type_id_idx"
  ON "invoice_report_titles" ("product_type_id");
