-- انتخاب پیش‌فرض برای اطلاعات پایه و تنخواه‌داران.
--
-- کاربر در هر فاکتور همان واحد، همان نوع انشعاب و همان تنخواه‌دار را انتخاب
-- می‌کرد؛ پیش‌فرض یعنی آن انتخابِ تکراری از پیش انجام شده و فقط استثناها دست
-- می‌خورند.
--
-- مهاجرت **فقط افزایشی** است: ستون تازه با مقدار پیش‌فرض `false` اضافه می‌شود و
-- هیچ ردیف موجودی عوض نمی‌شود.

ALTER TABLE "measurement_units"   ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "utility_types"       ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "fuel_types"          ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vehicle_types"       ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "product_types"       ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "stad_request_types"  ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "districts"           ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "petty_cash_holders"  ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

-- حداکثر یک پیش‌فرض در هر جدول.
--
-- قاعده در **پایگاه داده** گذاشته می‌شود، نه فقط در سرویس: دو درخواست هم‌زمان که
-- هر کدام ردیفی را پیش‌فرض می‌کنند، با بررسی در کد از هم بی‌خبرند و دو ردیف
-- پیش‌فرض می‌سازند.
CREATE UNIQUE INDEX "measurement_units_one_default_uk"  ON "measurement_units"  ((true)) WHERE "is_default" = true;
CREATE UNIQUE INDEX "utility_types_one_default_uk"      ON "utility_types"      ((true)) WHERE "is_default" = true;
CREATE UNIQUE INDEX "fuel_types_one_default_uk"         ON "fuel_types"         ((true)) WHERE "is_default" = true;
CREATE UNIQUE INDEX "vehicle_types_one_default_uk"      ON "vehicle_types"      ((true)) WHERE "is_default" = true;
CREATE UNIQUE INDEX "product_types_one_default_uk"      ON "product_types"      ((true)) WHERE "is_default" = true;
CREATE UNIQUE INDEX "stad_request_types_one_default_uk" ON "stad_request_types" ((true)) WHERE "is_default" = true;
CREATE UNIQUE INDEX "districts_one_default_uk"          ON "districts"          ((true)) WHERE "is_default" = true;
CREATE UNIQUE INDEX "petty_cash_holders_one_default_uk" ON "petty_cash_holders" ((true)) WHERE "is_default" = true;
