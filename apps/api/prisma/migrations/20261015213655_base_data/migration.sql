-- CreateEnum
CREATE TYPE "person_type" AS ENUM ('NATURAL', 'LEGAL');

-- CreateEnum
CREATE TYPE "budget_category_key" AS ENUM ('CURRENT', 'CAPITAL');

-- CreateEnum
CREATE TYPE "invoice_kind" AS ENUM ('NORMAL', 'STAD', 'UTILITY', 'FUEL');

-- CreateEnum
CREATE TYPE "payment_method_kind" AS ENUM ('BENEFICIARY_ACCOUNT', 'PETTY_CASH', 'BILL');

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" VARCHAR(300) NOT NULL,
    "address_line" TEXT,
    "postal_code" VARCHAR(10),
    "phone" VARCHAR(30),
    "fax" VARCHAR(30),
    "logo_path" VARCHAR(500),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signatories" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "position_title" VARCHAR(200) NOT NULL,
    "role_key" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "signatories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_entities" (
    "id" UUID NOT NULL,
    "person_type" "person_type" NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "economic_code" VARCHAR(30),
    "registration_number" VARCHAR(30),
    "national_id" VARCHAR(20),
    "address_line" TEXT,
    "postal_code" VARCHAR(10),
    "phone" VARCHAR(30),
    "fax" VARCHAR(30),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "buyer_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "person_type" "person_type" NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "representative_name" VARCHAR(200),
    "economic_code" VARCHAR(30),
    "registration_number" VARCHAR(30),
    "national_id" VARCHAR(20),
    "address_line" TEXT,
    "postal_code" VARCHAR(10),
    "phone" VARCHAR(30),
    "fax" VARCHAR(30),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banks" (
    "code" VARCHAR(3) NOT NULL,
    "title_fa" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "banks_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "vendor_bank_accounts" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "iban" VARCHAR(34) NOT NULL,
    "iban_normalized" VARCHAR(26) NOT NULL,
    "bank_code" VARCHAR(3),
    "account_title" VARCHAR(200),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vendor_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_categories" (
    "id" UUID NOT NULL,
    "key" "budget_category_key" NOT NULL,
    "title_fa" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_chapters" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "code" VARCHAR(50),
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budget_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_types" (
    "id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "kind" "invoice_kind" NOT NULL,
    "title_fa" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "default_payment_method_id" UUID,
    "custom_field_schema" JSONB,
    "custom_field_schema_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoice_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_invoice_types" (
    "chapter_id" UUID NOT NULL,
    "invoice_type_id" UUID NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chapter_invoice_types_pkey" PRIMARY KEY ("chapter_id","invoice_type_id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "kind" "payment_method_kind" NOT NULL,
    "title_fa" VARCHAR(100) NOT NULL,
    "requires_payment_identifier" BOOLEAN NOT NULL DEFAULT false,
    "requires_bill_identifier" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "invoice_type_id" UUID,
    "rate_bp" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_years" (
    "year" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "code" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "district_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "code" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utility_types" (
    "id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "utility_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_types" (
    "id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "plate_number" VARCHAR(50) NOT NULL,
    "plate_normalized" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_types" (
    "id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fuel_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stad_request_types" (
    "id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stad_request_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_types" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_units" (
    "id" UUID NOT NULL,
    "title" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "measurement_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signatories_is_active_sort_order_idx" ON "signatories"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "buyer_entities_is_active_sort_order_idx" ON "buyer_entities"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "vendors_is_active_idx" ON "vendors"("is_active");

-- CreateIndex
CREATE INDEX "vendors_name_idx" ON "vendors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_bank_accounts_iban_normalized_key" ON "vendor_bank_accounts"("iban_normalized");

-- CreateIndex
CREATE INDEX "vendor_bank_accounts_vendor_id_is_active_idx" ON "vendor_bank_accounts"("vendor_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "budget_categories_key_key" ON "budget_categories"("key");

-- CreateIndex
CREATE INDEX "budget_chapters_category_id_is_active_sort_order_idx" ON "budget_chapters"("category_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "budget_chapters_category_id_title_key" ON "budget_chapters"("category_id", "title");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_types_key_key" ON "invoice_types"("key");

-- CreateIndex
CREATE INDEX "invoice_types_is_active_sort_order_idx" ON "invoice_types"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "chapter_invoice_types_invoice_type_id_idx" ON "chapter_invoice_types"("invoice_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_key_key" ON "payment_methods"("key");

-- CreateIndex
CREATE INDEX "payment_methods_is_active_sort_order_idx" ON "payment_methods"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "tax_rates_fiscal_year_idx" ON "tax_rates"("fiscal_year");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_fiscal_year_invoice_type_id_key" ON "tax_rates"("fiscal_year", "invoice_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "districts_title_key" ON "districts"("title");

-- CreateIndex
CREATE INDEX "districts_is_active_sort_order_idx" ON "districts"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "schools_is_active_idx" ON "schools"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "schools_district_id_title_key" ON "schools"("district_id", "title");

-- CreateIndex
CREATE UNIQUE INDEX "utility_types_title_key" ON "utility_types"("title");

-- CreateIndex
CREATE INDEX "utility_types_is_active_sort_order_idx" ON "utility_types"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_types_title_key" ON "vehicle_types"("title");

-- CreateIndex
CREATE INDEX "vehicle_types_is_active_sort_order_idx" ON "vehicle_types"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_normalized_key" ON "vehicles"("plate_normalized");

-- CreateIndex
CREATE INDEX "vehicles_vehicle_type_id_is_active_idx" ON "vehicles"("vehicle_type_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_types_title_key" ON "fuel_types"("title");

-- CreateIndex
CREATE INDEX "fuel_types_is_active_sort_order_idx" ON "fuel_types"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "stad_request_types_title_key" ON "stad_request_types"("title");

-- CreateIndex
CREATE INDEX "stad_request_types_is_active_sort_order_idx" ON "stad_request_types"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "product_types_title_key" ON "product_types"("title");

-- CreateIndex
CREATE INDEX "product_types_is_active_sort_order_idx" ON "product_types"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_units_title_key" ON "measurement_units"("title");

-- CreateIndex
CREATE INDEX "measurement_units_is_active_sort_order_idx" ON "measurement_units"("is_active", "sort_order");

-- AddForeignKey
ALTER TABLE "vendor_bank_accounts" ADD CONSTRAINT "vendor_bank_accounts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bank_accounts" ADD CONSTRAINT "vendor_bank_accounts_bank_code_fkey" FOREIGN KEY ("bank_code") REFERENCES "banks"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_chapters" ADD CONSTRAINT "budget_chapters_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "budget_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_types" ADD CONSTRAINT "invoice_types_default_payment_method_id_fkey" FOREIGN KEY ("default_payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_invoice_types" ADD CONSTRAINT "chapter_invoice_types_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "budget_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_invoice_types" ADD CONSTRAINT "chapter_invoice_types_invoice_type_id_fkey" FOREIGN KEY ("invoice_type_id") REFERENCES "invoice_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_invoice_type_id_fkey" FOREIGN KEY ("invoice_type_id") REFERENCES "invoice_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
