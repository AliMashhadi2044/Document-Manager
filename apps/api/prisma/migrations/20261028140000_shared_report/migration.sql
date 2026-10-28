-- گزارشی که با عنوان و شرح برای بررسی فرستاده می‌شود.
--
-- تعریف گزارش ذخیره می‌شود و نه ردیف‌هایش: اجرا با مجوزهای گیرنده انجام می‌شود.
CREATE TYPE "NotificationKind_new" AS ENUM (
  'DOCUMENT_SENT_TO_ARCHIVE',
  'DOCUMENT_ARCHIVED',
  'DOCUMENT_NEEDS_REVISION',
  'FEEDBACK_CREATED',
  'FEEDBACK_REPLIED',
  'FEEDBACK_RESOLVED',
  'DOCUMENT_PAYMENT_OUTSTANDING',
  'DOCUMENT_PAYMENT_SETTLED',
  'REPORT_SHARED'
);
ALTER TABLE "notifications" ALTER COLUMN "kind" TYPE "NotificationKind_new" USING ("kind"::text::"NotificationKind_new");
DROP TYPE "NotificationKind";
ALTER TYPE "NotificationKind_new" RENAME TO "NotificationKind";

CREATE TABLE "shared_reports" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "sender_id"   UUID NOT NULL,
  "dataset_key" VARCHAR(40) NOT NULL,
  "title"       VARCHAR(200) NOT NULL,
  "description" TEXT,
  "columns"     JSONB NOT NULL,
  "filter"      JSONB NOT NULL,
  "sort"        JSONB NOT NULL,
  "page_size"   INTEGER NOT NULL DEFAULT 25,
  "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

  CONSTRAINT "shared_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shared_reports_title_check" CHECK (length(btrim("title")) > 0)
);

ALTER TABLE "shared_reports"
  ADD CONSTRAINT "shared_reports_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "shared_reports_sender_id_created_at_idx" ON "shared_reports" ("sender_id", "created_at");
CREATE INDEX "shared_reports_created_at_idx" ON "shared_reports" ("created_at");

ALTER TABLE "notifications" ADD COLUMN "shared_report_id" UUID;
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_shared_report_id_fkey"
  FOREIGN KEY ("shared_report_id") REFERENCES "shared_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- مجوزهای `report:share` و `report:share_read` با seed مرجع ساخته می‌شوند
-- (`prisma/seed/reference.ts`)، که فهرستش از `@dm/shared` می‌آید. تکرارشان اینجا
-- یعنی دو منبع حقیقت برای یک چیز.
