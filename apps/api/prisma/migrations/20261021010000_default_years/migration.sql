-- سال مالی و سال شمسیِ پیش‌فرضِ سازمان.
--
-- فرم ایجاد سند این دو را از پیش پر می‌کند. بدون آن، کاربر هر بار یک عدد تکراری
-- را تایپ می‌کند و هر اشتباه تایپی یک سند در سال اشتباه می‌سازد.
--
-- هر دو nullable اند: سازمانی که هنوز تنظیمش نکرده، نباید سالی ساختگی بگیرد.

ALTER TABLE "organization_settings"
  ADD COLUMN "default_fiscal_year" INTEGER,
  ADD COLUMN "default_jalali_year" INTEGER;

-- دامنه معقول سال شمسی. این محدودیت در پایگاه داده است نه فقط در سرویس، چون یک
-- سال نامعتبر در تنظیمات، بی‌صدا به همه اسناد تازه سرایت می‌کند.
ALTER TABLE "organization_settings"
  ADD CONSTRAINT "organization_settings_default_fiscal_year_range"
  CHECK ("default_fiscal_year" IS NULL OR ("default_fiscal_year" BETWEEN 1300 AND 1500));

ALTER TABLE "organization_settings"
  ADD CONSTRAINT "organization_settings_default_jalali_year_range"
  CHECK ("default_jalali_year" IS NULL OR ("default_jalali_year" BETWEEN 1300 AND 1500));
