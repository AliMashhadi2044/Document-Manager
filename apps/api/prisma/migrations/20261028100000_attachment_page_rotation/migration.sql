-- چرخش برگه‌های یک اسکن.
--
-- خودِ فایل و checksum آن دست‌نخورده می‌مانند؛ این جدول فقط می‌گوید هر برگه چقدر
-- باید چرخانده شود — در نمایشگر و در فایل دانلودی.
CREATE TABLE "attachment_page_rotations" (
  "attachment_id" UUID NOT NULL,
  "page_number"   INTEGER NOT NULL,
  "rotation"      INTEGER NOT NULL,
  "updated_by_id" UUID NOT NULL,
  "updated_at"    TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "attachment_page_rotations_pkey" PRIMARY KEY ("attachment_id", "page_number"),

  -- «بدون چرخش» یعنی نبودِ ردیف؛ صفر ذخیره نمی‌شود تا یک حالت، دو نمایش نداشته باشد.
  CONSTRAINT "attachment_page_rotations_rotation_check" CHECK ("rotation" IN (90, 180, 270)),
  CONSTRAINT "attachment_page_rotations_page_check" CHECK ("page_number" >= 1)
);

ALTER TABLE "attachment_page_rotations"
  ADD CONSTRAINT "attachment_page_rotations_attachment_id_fkey"
  FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attachment_page_rotations"
  ADD CONSTRAINT "attachment_page_rotations_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
