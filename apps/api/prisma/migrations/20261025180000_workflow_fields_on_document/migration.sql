-- شماره و تاریخ گردش، روی **خود سند**.
--
-- شمارهٔ گردش تا امروز داخل اطلاعات ستاد بود، پس سند عادی اصلاً جایی برای ثبتش
-- نداشت — در حالی که گردش کاغذی برای هر دو نوع سند وجود دارد. اینجا به خود سند
-- منتقل می‌شود و تاریخش هم کنارش می‌نشیند.
--
-- و شمارهٔ نیاز اختیاری می‌شود: سند ستاد ممکن است پیش از گرفتن شمارهٔ نیاز ثبت
-- شود و الزامی بودنش، کار را همان اول متوقف می‌کرد.

ALTER TABLE "financial_documents"
  ADD COLUMN "workflow_number" VARCHAR(100),
  ADD COLUMN "workflow_date"   DATE;

-- داده‌های موجود جابه‌جا می‌شوند، نه اینکه دور ریخته شوند: شمارهٔ گردشِ ثبت‌شدهٔ
-- اسناد ستاد باید همان‌جا که بود بماند، فقط یک جدول آن‌طرف‌تر.
UPDATE "financial_documents" AS d
   SET "workflow_number" = m."workflow_number"
  FROM "document_stad_metadata" AS m
 WHERE m."document_id" = d."id";

ALTER TABLE "document_stad_metadata" DROP COLUMN "workflow_number";

ALTER TABLE "document_stad_metadata" ALTER COLUMN "need_number" DROP NOT NULL;
