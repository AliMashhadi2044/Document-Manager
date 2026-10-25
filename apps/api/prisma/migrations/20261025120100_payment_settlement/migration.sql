-- وضعیت پرداخت سند: پرداخت کامل یا نیازمندی.
--
-- سند که بایگانی می‌شود، کار مالی‌اش لزوماً تمام نشده. این ستون‌ها همان چیزی را
-- ثبت می‌کنند که تا امروز فقط در ذهن بایگان و کارپرداز بود.

ALTER TABLE "financial_documents"
  ADD COLUMN "payment_status"       "payment_settlement_status",
  ADD COLUMN "paid_amount"          BIGINT,
  ADD COLUMN "outstanding_amount"   BIGINT,
  ADD COLUMN "payment_status_at"    TIMESTAMPTZ(3),
  ADD COLUMN "payment_status_by_id" UUID,
  ADD COLUMN "payment_date"         TIMESTAMPTZ(3);

ALTER TABLE "financial_documents"
  ADD CONSTRAINT "financial_documents_payment_status_by_id_fkey"
  FOREIGN KEY ("payment_status_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- کارتابل نیازمندی‌ها (قدیمی‌ترین اول) و شمارش‌های داشبورد.
CREATE INDEX "financial_documents_payment_status_at_idx"
  ON "financial_documents" ("payment_status", "payment_status_at");

-- ───────── سازگاری مبالغ با وضعیت ─────────
--
-- یک بی‌چون‌وچرا: **پرداخت‌شده + نیازمندی = مبلغ کل سند**. کمتر یعنی بخشی از پول نه
-- پرداخت شده و نه پیگیری می‌شود؛ بیشتر یعنی سند بیش از مبلغش تعهد نشان می‌دهد.
--
-- در «پرداخت کامل» این دو مشتق‌اند (کل مبلغ و صفر) و از کاربر پرسیده نمی‌شوند؛ قید
-- فقط نگهبانشان است. نیازمندیِ صفر هم پذیرفته نمی‌شود: آن «پرداخت کامل» است.
--
-- تاریخ پرداخت فقط در «پرداخت کامل» معنا دارد و در نیازمندی باید خالی باشد، وگرنه
-- سندی می‌داشتیم که هم تاریخ پرداخت دارد و هم مبلغ پیگیری‌نشده.
ALTER TABLE "financial_documents"
  ADD CONSTRAINT "financial_documents_payment_status_ck" CHECK (
    ("payment_status" IS NULL
      AND "paid_amount" IS NULL AND "outstanding_amount" IS NULL
      AND "payment_date" IS NULL AND "payment_status_at" IS NULL)
    OR ("payment_status" = 'FULLY_PAID'
      AND "paid_amount" = "total_amount" AND "outstanding_amount" = 0
      AND "payment_date" IS NOT NULL AND "payment_status_at" IS NOT NULL)
    OR ("payment_status" = 'OUTSTANDING'
      AND "paid_amount" >= 0 AND "outstanding_amount" > 0
      AND "paid_amount" + "outstanding_amount" = "total_amount"
      AND "payment_date" IS NULL AND "payment_status_at" IS NOT NULL)
  );
