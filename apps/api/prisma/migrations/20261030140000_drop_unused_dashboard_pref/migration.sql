-- ستون «dashboard» از مهاجرت نخست مانده بود و هیچ‌جا خوانده یا نوشته نشد.
--
-- بقیهٔ ستون‌های همین جدول (tableDensity، pageSize، columnVisibility) حالا واقعاً
-- استفاده می‌شوند؛ این یکی تنها ستونی بود که هیچ معنایی پشتش نبود.

ALTER TABLE "user_preferences" DROP COLUMN "dashboard";
