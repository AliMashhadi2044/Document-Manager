-- CreateEnum
CREATE TYPE "ArchiveStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('SCAN', 'OTHER', 'REPORT_OUTPUT');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'READY', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('SKIPPED', 'PENDING', 'CLEAN', 'INFECTED');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'ANSWERED', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FeedbackTargetKind" AS ENUM ('DOCUMENT', 'STAD_META', 'VENDOR', 'INVOICE', 'INVOICE_ITEM', 'PAYMENT', 'ARCHIVE', 'TAX_REPORT');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('DOCUMENT_SENT_TO_ARCHIVE', 'DOCUMENT_ARCHIVED', 'DOCUMENT_NEEDS_REVISION', 'FEEDBACK_CREATED', 'FEEDBACK_REPLIED', 'FEEDBACK_RESOLVED');

-- CreateTable
CREATE TABLE "archive_metadata" (
    "document_id" UUID NOT NULL,
    "status" "ArchiveStatus" NOT NULL DEFAULT 'RECEIVED',
    "notes" TEXT,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_by_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "archive_metadata_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'SCAN',
    "storage_key" VARCHAR(500) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "declared_mime" VARCHAR(150) NOT NULL,
    "detected_mime" VARCHAR(150) NOT NULL,
    "type_key" VARCHAR(20) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "page_count" INTEGER,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "scan_status" "ScanStatus" NOT NULL DEFAULT 'SKIPPED',
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" UUID,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_feedbacks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "target_kind" "FeedbackTargetKind" NOT NULL,
    "invoice_id" UUID,
    "invoice_item_id" UUID,
    "section_key" VARCHAR(100),
    "body" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "review_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_feedback_replies" (
    "id" UUID NOT NULL,
    "feedback_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_feedback_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_feedback_status_history" (
    "id" UUID NOT NULL,
    "feedback_id" UUID NOT NULL,
    "from_status" "FeedbackStatus",
    "to_status" "FeedbackStatus" NOT NULL,
    "note" TEXT,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_feedback_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "document_id" UUID,
    "feedback_id" UUID,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "archive_metadata_status_received_at_idx" ON "archive_metadata"("status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");

-- CreateIndex
CREATE INDEX "attachments_document_id_deleted_at_created_at_idx" ON "attachments"("document_id", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "attachments_checksum_sha256_idx" ON "attachments"("checksum_sha256");

-- CreateIndex
CREATE INDEX "review_feedbacks_document_id_status_created_at_idx" ON "review_feedbacks"("document_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "review_feedbacks_status_created_at_idx" ON "review_feedbacks"("status", "created_at");

-- CreateIndex
CREATE INDEX "review_feedbacks_invoice_id_idx" ON "review_feedbacks"("invoice_id");

-- CreateIndex
CREATE INDEX "review_feedback_replies_feedback_id_created_at_idx" ON "review_feedback_replies"("feedback_id", "created_at");

-- CreateIndex
CREATE INDEX "review_feedback_status_history_feedback_id_created_at_idx" ON "review_feedback_status_history"("feedback_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- AddForeignKey
ALTER TABLE "archive_metadata" ADD CONSTRAINT "archive_metadata_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "financial_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_metadata" ADD CONSTRAINT "archive_metadata_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "financial_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_feedbacks" ADD CONSTRAINT "review_feedbacks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "financial_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_feedbacks" ADD CONSTRAINT "review_feedbacks_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_feedbacks" ADD CONSTRAINT "review_feedbacks_invoice_item_id_fkey" FOREIGN KEY ("invoice_item_id") REFERENCES "invoice_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_feedbacks" ADD CONSTRAINT "review_feedbacks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_feedback_replies" ADD CONSTRAINT "review_feedback_replies_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "review_feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_feedback_replies" ADD CONSTRAINT "review_feedback_replies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_feedback_status_history" ADD CONSTRAINT "review_feedback_status_history_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "review_feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_feedback_status_history" ADD CONSTRAINT "review_feedback_status_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "financial_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════ قیدهایی که Prisma نمی‌تواند بیان کند ═══════════════

-- ۱. سازگاری هدف بازخورد با نوع هدف.
--    بدون این، بازخوردی با `target_kind = 'INVOICE'` می‌توانست بدون شناسه فاکتور
--    ثبت شود و کارتابل ناظر به چیزی اشاره کند که وجود ندارد.
ALTER TABLE "review_feedbacks"
  ADD CONSTRAINT "review_feedbacks_target_ck" CHECK (
    (
      "target_kind" = 'INVOICE_ITEM'
      AND "invoice_item_id" IS NOT NULL
      AND "invoice_id" IS NOT NULL
    )
    OR (
      "target_kind" IN ('INVOICE', 'PAYMENT')
      AND "invoice_id" IS NOT NULL
      AND "invoice_item_id" IS NULL
    )
    OR (
      "target_kind" IN ('DOCUMENT', 'STAD_META', 'VENDOR', 'ARCHIVE', 'TAX_REPORT')
      AND "invoice_id" IS NULL
      AND "invoice_item_id" IS NULL
    )
  );

-- ۲. متن بازخورد و پاسخ نمی‌تواند خالی باشد. «بازخورد خالی» یعنی ناظر چیزی نگفته،
--    ولی سند تا ابد علامت‌دار می‌ماند.
ALTER TABLE "review_feedbacks"
  ADD CONSTRAINT "review_feedbacks_body_ck" CHECK (length(btrim("body")) > 0);

ALTER TABLE "review_feedback_replies"
  ADD CONSTRAINT "review_feedback_replies_body_ck" CHECK (length(btrim("body")) > 0);

-- ۳. وضعیت RESOLVED باید زمان رسیدگی داشته باشد و بقیه وضعیت‌ها نباید.
ALTER TABLE "review_feedbacks"
  ADD CONSTRAINT "review_feedbacks_resolved_at_ck" CHECK (
    ("status" = 'RESOLVED' AND "resolved_at" IS NOT NULL)
    OR ("status" <> 'RESOLVED' AND "resolved_at" IS NULL)
  );

-- ۴. تغییر وضعیت بازخورد نمی‌تواند به خودش باشد؛ ردیف تاریخچه‌ای که چیزی عوض نکرده
--    فقط نویز است.
ALTER TABLE "review_feedback_status_history"
  ADD CONSTRAINT "review_feedback_status_history_change_ck" CHECK (
    "from_status" IS NULL OR "from_status" <> "to_status"
  );

-- ۵. فایل: حجم مثبت، checksum شانزده‌شانزدهی، و سازگاری حذف نرم.
ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_size_ck" CHECK ("size_bytes" > 0);

ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_checksum_ck" CHECK ("checksum_sha256" ~ '^[0-9a-f]{64}$');

ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_deleted_ck" CHECK (
    ("deleted_at" IS NULL AND "deleted_by_id" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by_id" IS NOT NULL)
  );

-- ۶. بایگانی تکمیل‌شده باید بایگان و زمان داشته باشد.
ALTER TABLE "archive_metadata"
  ADD CONSTRAINT "archive_metadata_completed_ck" CHECK (
    ("status" = 'COMPLETED' AND "archived_by_id" IS NOT NULL AND "archived_at" IS NOT NULL)
    OR ("status" <> 'COMPLETED')
  );

-- ۷. **تاریخ سند و شماره سند با هم** — سند بایگانی‌شده با شماره ولی بدون تاریخ،
--    یا برعکس، در گزارش رسمی بی‌معناست.
ALTER TABLE "financial_documents"
  ADD CONSTRAINT "financial_documents_number_date_ck" CHECK (
    ("document_number" IS NULL AND "document_date" IS NULL)
    OR ("document_number" IS NOT NULL AND "document_date" IS NOT NULL)
  );

-- ۸. سند بایگانی‌شده **باید** شماره و تاریخ داشته باشد (معیار پذیرش ۴ و تصمیم Q5).
--    این قید در سطح جدول است، پس هیچ مسیری — حتی UPDATE دستی — نمی‌تواند دورش بزند.
ALTER TABLE "financial_documents"
  ADD CONSTRAINT "financial_documents_archived_number_ck" CHECK (
    "status" <> 'ARCHIVED' OR ("document_number" IS NOT NULL AND "document_date" IS NOT NULL)
  );
