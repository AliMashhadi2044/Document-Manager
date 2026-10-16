-- گزارش‌گیری عمومی (فاز ۸): نمای ذخیره‌شده، کار خروجی‌گیری، و ایندکس‌های مسیرهای اصلی.
--
-- نکته: دو قید FK ترکیبیِ فاز ۶ و ۷ (`report_definitions_current_version_same_definition_fk`
-- و `report_types_active_definition_same_type_fk`) در schema قابل بیان نیستند، پس
-- `prisma migrate diff` هر بار پیشنهاد حذفشان را می‌دهد. آن پیشنهاد **اعمال نشده** و
-- این migration دست‌نویس است تا آن دو قید سر جایشان بمانند.

-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "report_views" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "dataset_key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "columns" JSONB NOT NULL,
    "filter" JSONB NOT NULL,
    "sort" JSONB NOT NULL,
    "page_size" INTEGER NOT NULL DEFAULT 25,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "report_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL,
    "dataset_key" VARCHAR(40) NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
    "params" JSONB NOT NULL,
    "row_count" INTEGER,
    "storage_key" VARCHAR(500),
    "size_bytes" BIGINT,
    "error_message" TEXT,
    "requested_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_views_dataset_key_is_shared_idx" ON "report_views"("dataset_key", "is_shared");

-- CreateIndex
CREATE UNIQUE INDEX "report_views_owner_id_dataset_key_name_key" ON "report_views"("owner_id", "dataset_key", "name");

-- CreateIndex
CREATE INDEX "export_jobs_requested_by_id_created_at_idx" ON "export_jobs"("requested_by_id", "created_at");

-- CreateIndex
CREATE INDEX "export_jobs_status_created_at_idx" ON "export_jobs"("status", "created_at");

-- AddForeignKey
ALTER TABLE "report_views" ADD CONSTRAINT "report_views_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ایندکس‌های مرتب‌سازی پیش‌فرض گزارش‌ها (معیار پذیرش ۵ فاز ۸).
--
-- هر مجموعه‌داده یک مرتب‌سازی پیش‌فرض دارد و همان است که بیشترین اجرا را می‌بیند.
-- ایندکس‌های موجود همه **پیشوند‌دار** بودند (`status, created_at` یا
-- `document_id, invoice_date, id`) و برای مرتب‌سازی سراسری بدون فیلترِ آن پیشوند
-- کاری نمی‌کردند. ترتیب ثانویه `id` هم در ایندکس آمده تا صفحه‌بندی پایدار، خودش
-- یک مرتب‌سازی اضافه تحمیل نکند.

CREATE INDEX "financial_documents_created_at_id_idx"
  ON "financial_documents"("created_at" DESC, "id");

CREATE INDEX "invoices_invoice_date_id_idx"
  ON "invoices"("invoice_date" DESC, "id");

CREATE INDEX "review_feedbacks_created_at_id_idx"
  ON "review_feedbacks"("created_at" DESC, "id");

CREATE INDEX "audit_logs_created_at_id_idx"
  ON "audit_logs"("created_at" DESC, "id");

CREATE INDEX "archive_metadata_received_at_document_id_idx"
  ON "archive_metadata"("received_at" DESC, "document_id");

CREATE INDEX "vendors_name_id_idx"
  ON "vendors"("name", "id");

-- کار خروجی‌گیری موفق باید فایل داشته باشد و کار ناموفق باید دلیل داشته باشد.
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_outcome_ck"
  CHECK (
    ("status" = 'SUCCEEDED' AND "storage_key" IS NOT NULL AND "expires_at" IS NOT NULL)
    OR ("status" = 'FAILED' AND "error_message" IS NOT NULL)
    OR ("status" IN ('PENDING', 'RUNNING', 'EXPIRED'))
  );

-- تعداد ردیف خروجی منفی بی‌معناست.
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_row_count_ck"
  CHECK ("row_count" IS NULL OR "row_count" >= 0);
