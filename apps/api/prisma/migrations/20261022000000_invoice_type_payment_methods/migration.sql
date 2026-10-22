-- روش‌های پرداخت مجاز برای هر نوع فاکتور.
--
-- چرا جدول جدا و نه یک ستون آرایه‌ای: این یک **رابطه** است و باید کلید خارجی داشته
-- باشد؛ با آرایهٔ شناسه، حذف یک روش پرداخت، ارجاع‌های مرده به جا می‌گذاشت.
--
-- معنای «خالی»: اگر برای یک نوع فاکتور هیچ ردیفی نباشد، همهٔ روش‌های فعال مجازند.
-- پس این مهاجرت هیچ ردیفی نمی‌سازد و رفتار سامانه دست‌نخورده می‌ماند.

CREATE TABLE "invoice_type_payment_methods" (
  "invoice_type_id"   UUID NOT NULL,
  "payment_method_id" UUID NOT NULL,
  "sort_order"        INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "invoice_type_payment_methods_pkey"
    PRIMARY KEY ("invoice_type_id", "payment_method_id"),

  CONSTRAINT "invoice_type_payment_methods_invoice_type_id_fkey"
    FOREIGN KEY ("invoice_type_id") REFERENCES "invoice_types" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "invoice_type_payment_methods_payment_method_id_fkey"
    FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "invoice_type_payment_methods_payment_method_id_idx"
  ON "invoice_type_payment_methods" ("payment_method_id");
