-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('NORMAL', 'STAD');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('DRAFT', 'FINALIZED', 'PENDING_ARCHIVE', 'ARCHIVED', 'NEEDS_REVISION', 'REOPENED');

-- CreateEnum
CREATE TYPE "tax_mode" AS ENUM ('PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "revision_trigger" AS ENUM ('FINALIZE', 'REOPEN', 'ARCHIVE', 'CORRECTION');

-- CreateTable
CREATE TABLE "vendor_snapshots" (
    "id" UUID NOT NULL,
    "vendor_id" UUID,
    "person_type" "person_type" NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "representative_name" VARCHAR(200),
    "economic_code" VARCHAR(30),
    "registration_number" VARCHAR(30),
    "national_id" VARCHAR(20),
    "address_line" TEXT,
    "postal_code" VARCHAR(10),
    "phone" VARCHAR(30),
    "fax" VARCHAR(30),
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_snapshots" (
    "id" UUID NOT NULL,
    "buyer_entity_id" UUID,
    "person_type" "person_type" NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "economic_code" VARCHAR(30),
    "registration_number" VARCHAR(30),
    "national_id" VARCHAR(20),
    "address_line" TEXT,
    "postal_code" VARCHAR(10),
    "phone" VARCHAR(30),
    "fax" VARCHAR(30),
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyer_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_documents" (
    "id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "type" "document_type" NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "jalali_year" INTEGER NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'DRAFT',
    "buyer_entity_id" UUID NOT NULL,
    "buyer_snapshot_id" UUID NOT NULL,
    "document_number" VARCHAR(50),
    "document_date" DATE,
    "rounding_policy" JSONB NOT NULL,
    "total_gross" BIGINT NOT NULL DEFAULT 0,
    "total_discount" BIGINT NOT NULL DEFAULT 0,
    "total_net" BIGINT NOT NULL DEFAULT 0,
    "total_tax" BIGINT NOT NULL DEFAULT 0,
    "total_amount" BIGINT NOT NULL DEFAULT 0,
    "open_feedback_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "finalized_at" TIMESTAMPTZ(3),
    "finalized_by_id" UUID,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "financial_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_stad_metadata" (
    "document_id" UUID NOT NULL,
    "need_number" VARCHAR(50) NOT NULL,
    "workflow_number" VARCHAR(100) NOT NULL,
    "request_number" VARCHAR(100) NOT NULL,
    "request_type_id" UUID,
    "notes" TEXT,

    CONSTRAINT "document_stad_metadata_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "document_revisions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "trigger" "revision_trigger" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_status_transitions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "from_status" "document_status" NOT NULL,
    "to_status" "document_status" NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "reason" TEXT,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_status_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_type" "document_type" NOT NULL,
    "invoice_type_id" UUID NOT NULL,
    "invoice_kind" "invoice_kind" NOT NULL,
    "chapter_id" UUID NOT NULL,
    "chapter_code_snapshot" VARCHAR(50),
    "chapter_title_snapshot" VARCHAR(200) NOT NULL,
    "vendor_id" UUID,
    "vendor_snapshot_id" UUID,
    "buyer_snapshot_id" UUID NOT NULL,
    "invoice_number" VARCHAR(100),
    "invoice_date" DATE NOT NULL,
    "tax_mode" "tax_mode" NOT NULL,
    "tax_rate_bp" INTEGER,
    "gross_amount" BIGINT NOT NULL,
    "discount_amount" BIGINT NOT NULL DEFAULT 0,
    "net_amount" BIGINT NOT NULL,
    "tax_amount" BIGINT NOT NULL DEFAULT 0,
    "total_amount" BIGINT NOT NULL,
    "custom_fields" JSONB,
    "custom_fields_schema_version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "sort_index" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "row_no" INTEGER NOT NULL,
    "product_code" VARCHAR(100),
    "description" VARCHAR(1000) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_id" UUID,
    "unit_price" BIGINT NOT NULL,
    "gross_amount" BIGINT NOT NULL,
    "discount_amount" BIGINT NOT NULL DEFAULT 0,
    "net_amount" BIGINT NOT NULL,
    "tax_mode" "tax_mode" NOT NULL,
    "tax_rate_bp" INTEGER,
    "tax_amount" BIGINT NOT NULL DEFAULT 0,
    "total_amount" BIGINT NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_payments" (
    "invoice_id" UUID NOT NULL,
    "payment_method_id" UUID NOT NULL,
    "method_kind" "payment_method_kind" NOT NULL,
    "vendor_bank_account_id" UUID,
    "iban_snapshot" VARCHAR(26),
    "bank_title_snapshot" VARCHAR(100),
    "account_title_snapshot" VARCHAR(200),
    "payment_identifier" VARCHAR(100),
    "bill_identifier" VARCHAR(100),
    "petty_cash_holder_id" UUID,
    "notes" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("invoice_id")
);

-- CreateIndex
CREATE INDEX "vendor_snapshots_vendor_id_idx" ON "vendor_snapshots"("vendor_id");

-- CreateIndex
CREATE INDEX "buyer_snapshots_buyer_entity_id_idx" ON "buyer_snapshots"("buyer_entity_id");

-- CreateIndex
CREATE INDEX "financial_documents_fiscal_year_status_type_created_at_idx" ON "financial_documents"("fiscal_year", "status", "type", "created_at");

-- CreateIndex
CREATE INDEX "financial_documents_status_created_at_idx" ON "financial_documents"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "financial_documents_id_type_key" ON "financial_documents"("id", "type");

-- CreateIndex
CREATE INDEX "document_revisions_document_id_created_at_idx" ON "document_revisions"("document_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_revisions_document_id_revision_no_key" ON "document_revisions"("document_id", "revision_no");

-- CreateIndex
CREATE INDEX "document_status_transitions_document_id_created_at_idx" ON "document_status_transitions"("document_id", "created_at");

-- CreateIndex
CREATE INDEX "invoices_document_id_invoice_date_id_idx" ON "invoices"("document_id", "invoice_date", "id");

-- CreateIndex
CREATE INDEX "invoices_vendor_id_invoice_date_idx" ON "invoices"("vendor_id", "invoice_date");

-- CreateIndex
CREATE INDEX "invoices_document_id_vendor_id_idx" ON "invoices"("document_id", "vendor_id");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_invoice_id_row_no_key" ON "invoice_items"("invoice_id", "row_no");

-- AddForeignKey
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_buyer_entity_id_fkey" FOREIGN KEY ("buyer_entity_id") REFERENCES "buyer_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_buyer_snapshot_id_fkey" FOREIGN KEY ("buyer_snapshot_id") REFERENCES "buyer_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_stad_metadata" ADD CONSTRAINT "document_stad_metadata_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "financial_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "financial_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_status_transitions" ADD CONSTRAINT "document_status_transitions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "financial_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_document_id_document_type_fkey" FOREIGN KEY ("document_id", "document_type") REFERENCES "financial_documents"("id", "type") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_invoice_type_id_fkey" FOREIGN KEY ("invoice_type_id") REFERENCES "invoice_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "budget_chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vendor_snapshot_id_fkey" FOREIGN KEY ("vendor_snapshot_id") REFERENCES "vendor_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_buyer_snapshot_id_fkey" FOREIGN KEY ("buyer_snapshot_id") REFERENCES "buyer_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "measurement_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_vendor_bank_account_id_fkey" FOREIGN KEY ("vendor_bank_account_id") REFERENCES "vendor_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_petty_cash_holder_id_fkey" FOREIGN KEY ("petty_cash_holder_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════ قیدهای مالی در سطح دیتابیس ═══════════════
-- این قیدها عمداً در دیتابیس‌اند، نه فقط در کد: اعتبارسنجی برنامه می‌تواند دور زده
-- شود یا در شرایط مسابقه‌ای شکست بخورد، ولی قید دیتابیس نمی‌تواند.
-- مرجع: docs/03-erd.md §۶ و docs/08-financial-rules.md

-- ───────── محدودیت یک فاکتور در سند ستاد (ADR-0006، ریسک R7) ─────────
-- سند ستاد حداکثر یک فاکتور دارد. ایندکس یکتای جزئی این را حتی برای دو درخواست
-- کاملاً همزمان تضمین می‌کند؛ بررسی count() در کد نمی‌توانست.
CREATE UNIQUE INDEX "invoices_one_per_stad_document_uk"
  ON "invoices" ("document_id")
  WHERE "document_type" = 'STAD';

-- ───────── یکتایی شماره سند در هر سال مالی (تصمیم Q5) ─────────
CREATE UNIQUE INDEX "financial_documents_number_per_year_uk"
  ON "financial_documents" ("fiscal_year", "document_number")
  WHERE "document_number" IS NOT NULL;

-- ───────── اتحادهای مالی ردیف فاکتور ─────────
-- هر مبلغ باید نامنفی باشد و دو اتحاد پایه همیشه برقرار بمانند:
--   net   = gross - discount
--   total = net + tax
-- اگر کدی روزی این‌ها را نقض کند، تراکنش در دیتابیس رد می‌شود، نه اینکه داده
-- ناسازگار بی‌صدا ذخیره شود.

ALTER TABLE "invoice_items"
  ADD CONSTRAINT "invoice_items_amounts_non_negative_ck" CHECK (
    "gross_amount" >= 0 AND "discount_amount" >= 0 AND
    "net_amount" >= 0 AND "tax_amount" >= 0 AND "total_amount" >= 0
  ),
  ADD CONSTRAINT "invoice_items_quantity_positive_ck" CHECK ("quantity" > 0),
  ADD CONSTRAINT "invoice_items_unit_price_non_negative_ck" CHECK ("unit_price" >= 0),
  ADD CONSTRAINT "invoice_items_discount_within_gross_ck" CHECK ("discount_amount" <= "gross_amount"),
  ADD CONSTRAINT "invoice_items_net_identity_ck" CHECK ("net_amount" = "gross_amount" - "discount_amount"),
  ADD CONSTRAINT "invoice_items_total_identity_ck" CHECK ("total_amount" = "net_amount" + "tax_amount"),
  -- حالت مالیات و نرخ باید با هم سازگار باشند: نرخ فقط در حالت درصدی معنا دارد.
  ADD CONSTRAINT "invoice_items_tax_mode_ck" CHECK (
    ("tax_mode" = 'PERCENT' AND "tax_rate_bp" IS NOT NULL AND "tax_rate_bp" BETWEEN 0 AND 10000)
    OR ("tax_mode" = 'AMOUNT' AND "tax_rate_bp" IS NULL)
  );

-- ───────── اتحادهای مالی فاکتور ─────────
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_amounts_non_negative_ck" CHECK (
    "gross_amount" >= 0 AND "discount_amount" >= 0 AND
    "net_amount" >= 0 AND "tax_amount" >= 0 AND "total_amount" >= 0
  ),
  ADD CONSTRAINT "invoices_discount_within_gross_ck" CHECK ("discount_amount" <= "gross_amount"),
  ADD CONSTRAINT "invoices_net_identity_ck" CHECK ("net_amount" = "gross_amount" - "discount_amount"),
  ADD CONSTRAINT "invoices_total_identity_ck" CHECK ("total_amount" = "net_amount" + "tax_amount"),
  ADD CONSTRAINT "invoices_tax_mode_ck" CHECK (
    ("tax_mode" = 'PERCENT' AND "tax_rate_bp" IS NOT NULL AND "tax_rate_bp" BETWEEN 0 AND 10000)
    OR ("tax_mode" = 'AMOUNT' AND "tax_rate_bp" IS NULL)
  );

-- ───────── اتحادهای مالی سند ─────────
ALTER TABLE "financial_documents"
  ADD CONSTRAINT "financial_documents_amounts_non_negative_ck" CHECK (
    "total_gross" >= 0 AND "total_discount" >= 0 AND
    "total_net" >= 0 AND "total_tax" >= 0 AND "total_amount" >= 0
  ),
  ADD CONSTRAINT "financial_documents_net_identity_ck" CHECK ("total_net" = "total_gross" - "total_discount"),
  ADD CONSTRAINT "financial_documents_total_identity_ck" CHECK ("total_amount" = "total_net" + "total_tax"),
  -- سال مالی و سال شمسی در بازه معقول
  ADD CONSTRAINT "financial_documents_years_ck" CHECK (
    "fiscal_year" BETWEEN 1300 AND 1500 AND "jalali_year" BETWEEN 1300 AND 1500
  );

-- ───────── سازگاری فیلدهای روش پرداخت (§۵ سند انواع فاکتور) ─────────
-- تغییر روش پرداخت باید فیلدهای روش قبلی را پاک کند، نه اینکه پنهانشان کند.
ALTER TABLE "invoice_payments"
  ADD CONSTRAINT "invoice_payments_method_fields_ck" CHECK (
    ("method_kind" = 'BENEFICIARY_ACCOUNT'
      AND "bill_identifier" IS NULL AND "petty_cash_holder_id" IS NULL)
    OR ("method_kind" = 'BILL'
      AND "vendor_bank_account_id" IS NULL AND "iban_snapshot" IS NULL
      AND "petty_cash_holder_id" IS NULL)
    OR ("method_kind" = 'PETTY_CASH'
      AND "vendor_bank_account_id" IS NULL AND "iban_snapshot" IS NULL
      AND "bill_identifier" IS NULL)
  );

-- ───────── تغییرناپذیری snapshotها (ADR-0005) ─────────
-- ردیف snapshot هرگز UPDATE نمی‌شود. تریگر این را در سطح دیتابیس تضمین می‌کند تا
-- یک اشتباه در کد نتواند اطلاعات تاریخی چند سند را خراب کند (ریسک R6).

CREATE OR REPLACE FUNCTION dm_reject_snapshot_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'snapshot رکوردهای تاریخی قابل تغییر نیستند (%).', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "vendor_snapshots_no_update"
  BEFORE UPDATE ON "vendor_snapshots"
  FOR EACH ROW EXECUTE FUNCTION dm_reject_snapshot_update();

CREATE TRIGGER "buyer_snapshots_no_update"
  BEFORE UPDATE ON "buyer_snapshots"
  FOR EACH ROW EXECUTE FUNCTION dm_reject_snapshot_update();
