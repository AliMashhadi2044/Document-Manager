-- قیدهایی که Prisma به‌تنهایی تولید نمی‌کند و باید در سطح دیتابیس اعمال شوند.
--
-- چرا لازم‌اند: در PostgreSQL مقدار NULL در یک UNIQUE مرکب «متمایز» شمرده می‌شود.
-- بنابراین UNIQUE(fiscal_year, invoice_type_id) جلوی ثبت دو «نرخ پیش‌فرض» برای یک
-- سال مالی را نمی‌گیرد. راه درست، ایندکس یکتای جزئی است.
-- مرجع: docs/03-erd.md §۶

DROP INDEX IF EXISTS "tax_rates_fiscal_year_invoice_type_id_key";

-- ───────────────────────── نرخ مالیات ─────────────────────────

-- برای هر سال مالی فقط یک نرخ پیش‌فرض (بدون نوع فاکتور).
CREATE UNIQUE INDEX "tax_rates_default_per_year_uk"
  ON "tax_rates" ("fiscal_year")
  WHERE "invoice_type_id" IS NULL;

-- و برای هر (سال، نوع فاکتور) فقط یک نرخ اختصاصی.
CREATE UNIQUE INDEX "tax_rates_per_year_and_type_uk"
  ON "tax_rates" ("fiscal_year", "invoice_type_id")
  WHERE "invoice_type_id" IS NOT NULL;

-- ───────────────────────── فروشنده ─────────────────────────
-- جلوگیری از فروشنده تکراری بر اساس شناسه‌های هویتی (§۱۱.۲).
-- تشخیص تکراری بودن عمداً بر اساس «نام» نیست، چون نام مشابه فراوان است.

CREATE UNIQUE INDEX "vendors_economic_code_uk"
  ON "vendors" ("economic_code")
  WHERE "economic_code" IS NOT NULL;

CREATE UNIQUE INDEX "vendors_national_id_uk"
  ON "vendors" ("national_id")
  WHERE "national_id" IS NOT NULL;

CREATE UNIQUE INDEX "buyer_entities_economic_code_uk"
  ON "buyer_entities" ("economic_code")
  WHERE "economic_code" IS NOT NULL;

-- حداکثر یک شبای پیش‌فرض برای هر فروشنده.
CREATE UNIQUE INDEX "vendor_bank_accounts_one_default_uk"
  ON "vendor_bank_accounts" ("vendor_id")
  WHERE "is_default" = true;

-- ───────────────────────── فصل بودجه ─────────────────────────

-- کد فصل، در صورت وجود، در هر گروه بودجه یکتاست.
CREATE UNIQUE INDEX "budget_chapters_code_uk"
  ON "budget_chapters" ("category_id", "code")
  WHERE "code" IS NOT NULL;

-- حداکثر یک نوع فاکتور پیش‌فرض برای هر فصل.
CREATE UNIQUE INDEX "chapter_invoice_types_one_default_uk"
  ON "chapter_invoice_types" ("chapter_id")
  WHERE "is_default" = true;

-- ───────────────────────── تنظیمات سازمان ─────────────────────────
-- جدول تنظیمات سازمان باید دقیقاً یک ردیف داشته باشد.

ALTER TABLE "organization_settings"
  ADD CONSTRAINT "organization_settings_singleton_ck" CHECK ("id" = 1);

-- ───────────────────────── نرخ معتبر ─────────────────────────
-- نرخ مالیات باید بین ۰ تا ۱۰۰ درصد باشد (basis point صحیح).

ALTER TABLE "tax_rates"
  ADD CONSTRAINT "tax_rates_rate_bp_range_ck" CHECK ("rate_bp" >= 0 AND "rate_bp" <= 10000);
