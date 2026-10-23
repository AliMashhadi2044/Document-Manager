-- شرح فاکتور، و «نوع کالا»یی که می‌تواند متن آزاد باشد.
--
-- شرح فاکتور یک **عنوان** است، نه یادداشت: یک خط که می‌گوید فاکتور بابت چیست. در
-- گزارش مالیات همین، پیش‌فرضِ ستون «نوع کالا» می‌شود.

ALTER TABLE "invoices" ADD COLUMN "description" VARCHAR(500);

-- نوع کالا دیگر الزاماً از فهرست نیست.
ALTER TABLE "document_vendor_product_types"
    ADD COLUMN "custom_title" VARCHAR(500);

ALTER TABLE "document_vendor_product_types"
    ALTER COLUMN "product_type_id" DROP NOT NULL;

-- دقیقاً یکی از دو مقدار پر است: نه هر دو، نه هیچ‌کدام.
ALTER TABLE "document_vendor_product_types"
    ADD CONSTRAINT "document_vendor_product_types_one_source_check"
    CHECK (("product_type_id" IS NULL) <> ("custom_title" IS NULL));
