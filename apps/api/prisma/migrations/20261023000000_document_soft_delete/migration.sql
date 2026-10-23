-- سطل زباله سند.
--
-- حذف هیچ‌وقت ردیف را پاک نمی‌کند؛ فقط `deleted_at` پر می‌شود و سند از همه‌جا
-- کنار می‌رود. پاک کردن واقعی فقط از خود سطل زباله و با عمل صریح کاربر انجام
-- می‌شود.

ALTER TABLE "financial_documents"
    ADD COLUMN "deleted_at" TIMESTAMPTZ(3),
    ADD COLUMN "deleted_by_id" UUID,
    ADD COLUMN "delete_reason" TEXT;

ALTER TABLE "financial_documents"
    ADD CONSTRAINT "financial_documents_deleted_by_id_fkey"
    FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- هر کوئری دیگری هم «حذف‌نشده» را شرط می‌گذارد، پس این ایندکس فقط برای فهرست
-- سطل زباله نیست.
CREATE INDEX "financial_documents_deleted_at_idx" ON "financial_documents"("deleted_at");

-- دلیل حذف، وقتی سندی در سطل زباله است، همیشه ثبت شده است.
ALTER TABLE "financial_documents"
    ADD CONSTRAINT "financial_documents_delete_reason_check"
    CHECK ("deleted_at" IS NULL OR "delete_reason" IS NOT NULL);
