-- CreateTable
CREATE TABLE "invoice_utility_details" (
    "invoice_id" UUID NOT NULL,
    "invoice_kind" "invoice_kind" NOT NULL,
    "school_id" UUID NOT NULL,
    "school_title_snapshot" VARCHAR(200) NOT NULL,
    "district_id" UUID NOT NULL,
    "district_title_snapshot" VARCHAR(200) NOT NULL,
    "utility_type_id" UUID NOT NULL,
    "utility_type_title_snapshot" VARCHAR(150) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_utility_details_pkey" PRIMARY KEY ("invoice_id")
);

-- CreateTable
CREATE TABLE "invoice_fuel_details" (
    "invoice_id" UUID NOT NULL,
    "invoice_kind" "invoice_kind" NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "plate_number_snapshot" VARCHAR(50) NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "vehicle_type_title_snapshot" VARCHAR(150) NOT NULL,
    "fuel_type_id" UUID NOT NULL,
    "fuel_type_title_snapshot" VARCHAR(100) NOT NULL,
    "jalali_year" INTEGER NOT NULL,
    "jalali_month" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_fuel_details_pkey" PRIMARY KEY ("invoice_id")
);

-- CreateTable
CREATE TABLE "invoice_fuel_entries" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "invoice_item_id" UUID NOT NULL,
    "jalali_day" INTEGER NOT NULL,
    "entry_date" DATE NOT NULL,

    CONSTRAINT "invoice_fuel_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_utility_details_school_id_idx" ON "invoice_utility_details"("school_id");

-- CreateIndex
CREATE INDEX "invoice_utility_details_district_id_idx" ON "invoice_utility_details"("district_id");

-- CreateIndex
CREATE INDEX "invoice_utility_details_utility_type_id_idx" ON "invoice_utility_details"("utility_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_utility_details_invoice_id_invoice_kind_key" ON "invoice_utility_details"("invoice_id", "invoice_kind");

-- CreateIndex
CREATE INDEX "invoice_fuel_details_vehicle_id_idx" ON "invoice_fuel_details"("vehicle_id");

-- CreateIndex
CREATE INDEX "invoice_fuel_details_vehicle_type_id_idx" ON "invoice_fuel_details"("vehicle_type_id");

-- CreateIndex
CREATE INDEX "invoice_fuel_details_fuel_type_id_idx" ON "invoice_fuel_details"("fuel_type_id");

-- CreateIndex
CREATE INDEX "invoice_fuel_details_jalali_year_jalali_month_idx" ON "invoice_fuel_details"("jalali_year", "jalali_month");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_fuel_details_invoice_id_invoice_kind_key" ON "invoice_fuel_details"("invoice_id", "invoice_kind");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_fuel_entries_invoice_item_id_key" ON "invoice_fuel_entries"("invoice_item_id");

-- CreateIndex
CREATE INDEX "invoice_fuel_entries_invoice_id_jalali_day_idx" ON "invoice_fuel_entries"("invoice_id", "jalali_day");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_fuel_entries_invoice_item_id_invoice_id_key" ON "invoice_fuel_entries"("invoice_item_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_id_invoice_id_key" ON "invoice_items"("id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_id_invoice_kind_key" ON "invoices"("id", "invoice_kind");

-- AddForeignKey
ALTER TABLE "invoice_utility_details" ADD CONSTRAINT "invoice_utility_details_invoice_id_invoice_kind_fkey" FOREIGN KEY ("invoice_id", "invoice_kind") REFERENCES "invoices"("id", "invoice_kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_utility_details" ADD CONSTRAINT "invoice_utility_details_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_utility_details" ADD CONSTRAINT "invoice_utility_details_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_utility_details" ADD CONSTRAINT "invoice_utility_details_utility_type_id_fkey" FOREIGN KEY ("utility_type_id") REFERENCES "utility_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_fuel_details" ADD CONSTRAINT "invoice_fuel_details_invoice_id_invoice_kind_fkey" FOREIGN KEY ("invoice_id", "invoice_kind") REFERENCES "invoices"("id", "invoice_kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_fuel_details" ADD CONSTRAINT "invoice_fuel_details_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_fuel_details" ADD CONSTRAINT "invoice_fuel_details_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_fuel_details" ADD CONSTRAINT "invoice_fuel_details_fuel_type_id_fkey" FOREIGN KEY ("fuel_type_id") REFERENCES "fuel_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_fuel_entries" ADD CONSTRAINT "invoice_fuel_entries_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice_fuel_details"("invoice_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_fuel_entries" ADD CONSTRAINT "invoice_fuel_entries_invoice_item_id_invoice_id_fkey" FOREIGN KEY ("invoice_item_id", "invoice_id") REFERENCES "invoice_items"("id", "invoice_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════ قیدهایی که Prisma نمی‌تواند بیان کند ═══════════════
-- فلسفه همان فاز ۳ است: هر قاعده‌ای که نقضش داده را بی‌معنا می‌کند، در دیتابیس
-- نگه داشته می‌شود؛ کد لایه دوم است، نه تنها لایه.

-- ۱. قفل خانواده روی جدول‌های جزئیات.
--    ستون `invoice_kind` این جدول‌ها فقط برای FK ترکیبی وجود دارد و مقدارش ثابت است.
--    با این دو CHECK، ردیف جزئیات انشعابات به هیچ فاکتوری جز فاکتور انشعابات
--    نمی‌چسبد — حتی اگر کد اشتباه کند.
ALTER TABLE "invoice_utility_details"
  ADD CONSTRAINT "invoice_utility_details_kind_ck" CHECK ("invoice_kind" = 'UTILITY');

ALTER TABLE "invoice_fuel_details"
  ADD CONSTRAINT "invoice_fuel_details_kind_ck" CHECK ("invoice_kind" = 'FUEL');

-- ۲. بازه ماه و سال شمسی فاکتور سوخت.
ALTER TABLE "invoice_fuel_details"
  ADD CONSTRAINT "invoice_fuel_details_month_ck" CHECK ("jalali_month" BETWEEN 1 AND 12);

ALTER TABLE "invoice_fuel_details"
  ADD CONSTRAINT "invoice_fuel_details_year_ck" CHECK ("jalali_year" BETWEEN 1300 AND 1500);

-- ۳. بازه روز ردیف سوخت‌گیری.
--    اینکه روز در آن ماه **واقعاً وجود دارد** (۳۱ مهر، ۳۰ اسفند غیرکبیسه) در
--    `resolveFuelEntries` بررسی می‌شود؛ بیان تقویم شمسی در CHECK ممکن نیست.
ALTER TABLE "invoice_fuel_entries"
  ADD CONSTRAINT "invoice_fuel_entries_day_ck" CHECK ("jalali_day" BETWEEN 1 AND 31);
