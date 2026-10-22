-- تنخواه‌دار به‌عنوان اطلاعات پایه، جدا از کاربران سامانه.
--
-- پیش از این `invoice_payments.petty_cash_holder_id` به `users` اشاره می‌کرد، پس
-- تعریف تنخواه‌دار در گرو ساختن حساب کاربری بود و فرم فاکتور عملاً هیچ‌وقت مقداری
-- برایش نمی‌فرستاد (ستون همه‌جا NULL است). اینجا ستون به جدول تازه می‌رود.

CREATE TABLE "petty_cash_holders" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "position_title" VARCHAR(200),
    "national_id" VARCHAR(20),
    "phone" VARCHAR(30),
    "account_holder_name" VARCHAR(200),
    "bank_code" VARCHAR(3),
    "iban" VARCHAR(34),
    "iban_normalized" VARCHAR(26),
    "account_number" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "petty_cash_holders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "petty_cash_holders_is_active_sort_order_idx"
    ON "petty_cash_holders"("is_active", "sort_order");

ALTER TABLE "petty_cash_holders"
    ADD CONSTRAINT "petty_cash_holders_bank_code_fkey"
    FOREIGN KEY ("bank_code") REFERENCES "banks"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- ارجاع قبلی به کاربران برداشته می‌شود. مقدارهای موجود (اگر باشند) دیگر معنا
-- ندارند چون شناسه‌شان در جدول تازه وجود ندارد، پس خالی می‌شوند.
ALTER TABLE "invoice_payments" DROP CONSTRAINT IF EXISTS "invoice_payments_petty_cash_holder_id_fkey";
UPDATE "invoice_payments" SET "petty_cash_holder_id" = NULL WHERE "petty_cash_holder_id" IS NOT NULL;

ALTER TABLE "invoice_payments"
    ADD COLUMN "petty_cash_holder_name_snapshot" VARCHAR(200),
    ADD COLUMN "petty_cash_account_holder_snapshot" VARCHAR(200),
    ADD COLUMN "petty_cash_bank_title_snapshot" VARCHAR(100),
    ADD COLUMN "petty_cash_iban_snapshot" VARCHAR(34);

ALTER TABLE "invoice_payments"
    ADD CONSTRAINT "invoice_payments_petty_cash_holder_id_fkey"
    FOREIGN KEY ("petty_cash_holder_id") REFERENCES "petty_cash_holders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
