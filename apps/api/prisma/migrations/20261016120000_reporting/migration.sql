-- CreateEnum
CREATE TYPE "ReportDefinitionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReportVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ReportRunStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportOutputFormat" AS ENUM ('HTML', 'EXCEL', 'PDF');

-- CreateTable
CREATE TABLE "report_types" (
    "id" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "title_fa" VARCHAR(200) NOT NULL,
    "data_scope_key" VARCHAR(60) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "report_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_definitions" (
    "id" UUID NOT NULL,
    "report_type_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "ReportDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version_id" UUID,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "report_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_versions" (
    "id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "status" "ReportVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "template_schema_version" INTEGER NOT NULL DEFAULT 1,
    "template" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_runs" (
    "id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_revision_id" UUID,
    "params" JSONB NOT NULL DEFAULT '{}',
    "status" "ReportRunStatus" NOT NULL DEFAULT 'PENDING',
    "outputFormat" "ReportOutputFormat" NOT NULL,
    "row_count" INTEGER,
    "duration_ms" INTEGER,
    "error_message" TEXT,
    "requested_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_vendor_product_types" (
    "document_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "product_type_id" UUID NOT NULL,
    "set_by" UUID NOT NULL,
    "set_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_vendor_product_types_pkey" PRIMARY KEY ("document_id","vendor_id")
);

-- CreateTable
CREATE TABLE "vendor_product_type_suggestions" (
    "vendor_id" UUID NOT NULL,
    "product_type_id" UUID NOT NULL,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_product_type_suggestions_pkey" PRIMARY KEY ("vendor_id","product_type_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_types_key_key" ON "report_types"("key");

-- CreateIndex
CREATE UNIQUE INDEX "report_definitions_current_version_id_key" ON "report_definitions"("current_version_id");

-- CreateIndex
CREATE INDEX "report_definitions_report_type_id_status_idx" ON "report_definitions"("report_type_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "report_versions_definition_id_version_no_key" ON "report_versions"("definition_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "report_versions_id_definition_id_key" ON "report_versions"("id", "definition_id");

-- CreateIndex
CREATE INDEX "report_runs_document_id_created_at_idx" ON "report_runs"("document_id", "created_at");

-- CreateIndex
CREATE INDEX "report_runs_requested_by_created_at_idx" ON "report_runs"("requested_by", "created_at");

-- CreateIndex
CREATE INDEX "document_vendor_product_types_vendor_id_idx" ON "document_vendor_product_types"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_product_type_suggestions_vendor_id_use_count_idx" ON "vendor_product_type_suggestions"("vendor_id", "use_count");

-- AddForeignKey
ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_report_type_id_fkey" FOREIGN KEY ("report_type_id") REFERENCES "report_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "report_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "report_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "report_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "report_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "financial_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_vendor_product_types" ADD CONSTRAINT "document_vendor_product_types_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "financial_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_vendor_product_types" ADD CONSTRAINT "document_vendor_product_types_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_vendor_product_types" ADD CONSTRAINT "document_vendor_product_types_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_vendor_product_types" ADD CONSTRAINT "document_vendor_product_types_set_by_fkey" FOREIGN KEY ("set_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_product_type_suggestions" ADD CONSTRAINT "vendor_product_type_suggestions_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_product_type_suggestions" ADD CONSTRAINT "vendor_product_type_suggestions_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════ قیدهایی که Prisma بیانشان نمی‌کند ═══════════
-- هر کدام یک ادعای واقعی درباره داده‌اند، نه زینت. اگر کد روزی اشتباه کند،
-- دیتابیس همان‌جا جلویش را می‌گیرد.

-- نسخه منتشرشده بدون زمان انتشار بی‌معناست؛ و نسخه DRAFT زمان انتشار ندارد.
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_published_at_ck"
  CHECK (("status" = 'PUBLISHED' AND "published_at" IS NOT NULL)
      OR ("status" = 'DRAFT' AND "published_at" IS NULL));

-- شماره نسخه از ۱ شروع می‌شود.
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_version_no_ck"
  CHECK ("version_no" >= 1);

-- نسخه جاری یک قالب باید نسخه **همان** قالب باشد — نه نسخه قالبی دیگر.
-- بدون این FK ترکیبی، یک به‌روزرسانی اشتباه می‌توانست قالب A را به نسخه قالب B ببندد
-- و خروجی تاریخی را بی‌صدا عوض کند.
ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_current_version_same_definition_fk"
  FOREIGN KEY ("current_version_id", "id")
  REFERENCES "report_versions"("id", "definition_id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- اجرای ناموفق باید دلیل داشته باشد، وگرنه «ناموفق» هیچ اطلاعاتی نمی‌دهد.
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_failed_reason_ck"
  CHECK ("status" <> 'FAILED' OR "error_message" IS NOT NULL);

-- شمارش‌ها منفی نمی‌شوند.
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_counters_ck"
  CHECK (COALESCE("row_count", 0) >= 0 AND COALESCE("duration_ms", 0) >= 0);

ALTER TABLE "vendor_product_type_suggestions" ADD CONSTRAINT "vendor_product_type_suggestions_count_ck"
  CHECK ("use_count" >= 0);
