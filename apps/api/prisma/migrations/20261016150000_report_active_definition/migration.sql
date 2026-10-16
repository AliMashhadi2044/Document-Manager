-- قالب فعال هر نوع گزارش (فاز ۷).
--
-- پیش از این، «کدام قالبِ منتشرشده اجرا می‌شود» با یک `findFirst` و ترتیب `created_at`
-- تعیین می‌شد. نتیجه‌اش این بود که اگر کاربری از قالب سیستمی کپی می‌گرفت، ویرایش و
-- منتشرش می‌کرد، همان قالب سیستمیِ قدیمی‌تر باز هم اجرا می‌شد — یعنی کل کار طراح بی‌اثر
-- می‌ماند و هیچ خطایی هم دیده نمی‌شد. انتخاب قالب فعال از این پس یک اقدام صریح است.

ALTER TABLE "report_types" ADD COLUMN "active_definition_id" UUID;

CREATE UNIQUE INDEX "report_types_active_definition_id_key"
  ON "report_types"("active_definition_id");

ALTER TABLE "report_types" ADD CONSTRAINT "report_types_active_definition_id_fkey"
  FOREIGN KEY ("active_definition_id") REFERENCES "report_definitions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ستون فقرات FK ترکیبی بعدی.
CREATE UNIQUE INDEX "report_definitions_id_report_type_id_key"
  ON "report_definitions"("id", "report_type_id");

-- قالب فعال یک نوع گزارش باید قالبی از **همان** نوع باشد.
--
-- `SET NULL ("active_definition_id")` با فهرست ستون نوشته شده است: بدون فهرست، Postgres
-- می‌خواهد **همه** ستون‌های ارجاع‌دهنده را تهی کند — از جمله `id` که کلید اصلی و
-- NOT NULL است — و حذفِ قالب، به‌جای تهی‌کردن ارجاع، با خطای گنگ شکست می‌خورد.
ALTER TABLE "report_types" ADD CONSTRAINT "report_types_active_definition_same_type_fk"
  FOREIGN KEY ("active_definition_id", "id")
  REFERENCES "report_definitions"("id", "report_type_id")
  ON DELETE SET NULL ("active_definition_id") ON UPDATE RESTRICT;

-- همان نقص در FK ترکیبی فاز ۶ هم بود: حذف نسخه‌ای که نسخه جاری یک قالب است، تلاش
-- می‌کرد `report_definitions.id` را تهی کند. اینجا با فهرست ستون درست می‌شود.
ALTER TABLE "report_definitions"
  DROP CONSTRAINT "report_definitions_current_version_same_definition_fk";

ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_current_version_same_definition_fk"
  FOREIGN KEY ("current_version_id", "id")
  REFERENCES "report_versions"("id", "definition_id")
  ON DELETE SET NULL ("current_version_id") ON UPDATE RESTRICT;

-- پرکردن مقدار اولیه: قالب سیستمیِ منتشرشده هر نوع گزارش، همان قالبی است که تا امروز
-- اجرا می‌شده. پس رفتار موجود عوض نمی‌شود.
UPDATE "report_types" AS t
SET "active_definition_id" = d."id"
FROM "report_definitions" AS d
WHERE d."report_type_id" = t."id"
  AND d."is_system" = TRUE
  AND d."status" = 'PUBLISHED'
  AND d."current_version_id" IS NOT NULL
  AND t."active_definition_id" IS NULL;
