
# ۱۷ — پلن اجرای کوئری‌های گزارش‌گیری

این سند **خروجی خودکار** `npm run explain:phase8` است و دستی نوشته نشده. اسکریپت
داده حجیم موقت می‌سازد، SQL واقعیِ تولیدشده توسط Prisma را از رویداد `query`
می‌گیرد، روی هر کدام `EXPLAIN (ANALYZE)` اجرا می‌کند و در پایان داده موقت را پاک
می‌کند.

تاریخ ثبت: 2026-10-16T17:17:01.710Z

## اندازه جدول‌ها در لحظه ثبت

| جدول | تعداد ردیف تخمینی |
|---|---|
| `invoices` | 60,052 |
| `financial_documents` | 20,025 |
| `audit_logs` | 547 |
| `review_feedbacks` | 10 |
| `archive_metadata` | 4 |
| `vendors` | 3 |

## فهرست اسناد — دامنه دسترسی + مرتب‌سازی پیش‌فرض + صفحه‌بندی

### کوئری 1

```sql
SELECT "public"."financial_documents"."id", "public"."financial_documents"."title", "public"."financial_documents"."status"::text, "public"."financial_documents"."total_amount" FROM "public"."financial_documents" WHERE "public"."financial_documents"."status" <> CAST($1::text AS "public"."document_status") ORDER BY "public"."financial_documents"."created_at" DESC, "public"."financial_documents"."id" ASC LIMIT $2 OFFSET $3
```

```
Limit  (cost=0.29..5.46 rows=25 width=86) (actual rows=25 loops=1)
  ->  Index Scan using financial_documents_created_at_id_idx on financial_documents  (cost=0.29..2758.89 rows=13345 width=86) (actual rows=25 loops=1)
        Filter: (status <> ('DRAFT'::cstring)::document_status)
        Rows Removed by Filter: 12
```

> ✅ بدون پیمایش کامل روی جدول بزرگ.

### کوئری 2

```sql
SELECT COUNT(*) FROM (SELECT "public"."financial_documents"."id" FROM "public"."financial_documents" WHERE "public"."financial_documents"."status" <> CAST($1::text AS "public"."document_status") OFFSET $2) AS "sub"
```

```
Aggregate  (cost=1143.25..1143.26 rows=1 width=8) (actual rows=1 loops=1)
  ->  Seq Scan on financial_documents  (cost=0.00..976.44 rows=13345 width=16) (actual rows=13345 loops=1)
        Filter: (status <> ('DRAFT'::cstring)::document_status)
        Rows Removed by Filter: 6680
```

> ✅ پیمایش کامل `financial_documents` روی 13,345 از 20,025 ردیف (67٪). این کوئری **تجمیعی** است و بخش بزرگی از جدول را می‌خواند؛ در این نسبت، خواندن ترتیبی از خواندن با ایندکس ارزان‌تر است و انتخاب planner درست است.

## گزارش فاکتورها — فیلتر مبلغ + مرتب‌سازی تاریخ صورتحساب

### کوئری 1

```sql
SELECT "public"."invoices"."id", "public"."invoices"."invoice_number", "public"."invoices"."invoice_date", "public"."invoices"."total_amount", "public"."invoices"."document_id", "public"."invoices"."document_type"::text FROM "public"."invoices" LEFT JOIN "public"."financial_documents" AS "j1" ON ("j1"."id","j1"."type") = ("public"."invoices"."document_id","public"."invoices"."document_type") WHERE (("j1"."status" <> CAST($1::text AS "public"."document_status") AND ("j1"."id" IS NOT NULL)) AND "public"."invoices"."total_amount" > $2) ORDER BY "public"."invoices"."invoice_date" DESC, "public"."invoices"."id" ASC LIMIT $3 OFFSET $4
```

```
Limit  (cost=0.71..13.10 rows=25 width=90) (actual rows=25 loops=1)
  ->  Nested Loop  (cost=0.71..19829.22 rows=40015 width=90) (actual rows=25 loops=1)
        ->  Index Scan using invoices_invoice_date_id_idx on invoices  (cost=0.41..10672.94 rows=60045 width=62) (actual rows=43 loops=1)
              Filter: (total_amount > '1000000'::bigint)
        ->  Memoize  (cost=0.30..0.38 rows=1 width=20) (actual rows=1 loops=43)
              Cache Key: invoices.document_id, invoices.document_type
              Cache Mode: logical
              Hits: 1  Misses: 42  Evictions: 0  Overflows: 0  Memory Usage: 5kB
              ->  Index Scan using financial_documents_pkey on financial_documents j1  (cost=0.29..0.37 rows=1 width=20) (actual rows=1 loops=42)
                    Index Cond: ((id = invoices.document_id) AND (id IS NOT NULL))
                    Filter: ((type = invoices.document_type) AND (status <> ('DRAFT'::cstring)::document_status))
                    Rows Removed by Filter: 0
```

> ✅ بدون پیمایش کامل روی جدول بزرگ.

### کوئری 2

```sql
SELECT "public"."financial_documents"."id", "public"."financial_documents"."title", "public"."financial_documents"."type"::text FROM "public"."financial_documents" WHERE ("public"."financial_documents"."id","public"."financial_documents"."type") IN (($1,CAST($2::text AS "public"."document_type")),($3,CAST($4::text AS "public"."document_type")),($5,CAST($6::text AS "public"."document_type")),($7,CAST($8::text AS "public"."document_type")),($9,CAST($10::text AS "public"."document_type")),($11,CAST($12::text AS "public"."document_type")),($13,CAST($14::text AS "public"."document_type")),($15,CAST($16::text AS "public"."document_type")),($17,CAST($18::text AS "public"."document_type")),($19,CAST($20::text AS "public"."document_type")),($21,CAST($22::text AS "public"."document_type")),($23,CAST($24::text AS "public"."document_type")),($25,CAST($26::text AS "public"."document_type")),($27,CAST($28::text AS "public"."document_type")),($29,CAST($30::text AS "public"."document_type")),($31,CAST($32::text AS "public"."document_type")),($33,CAST($34::text AS "public"."document_type")),($35,CAST($36::text AS "public"."document_type")),($37,CAST($38::text AS "public"."document_type")),($39,CAST($40::text AS "public"."document_type")),($41,CAST($42::text AS "public"."document_type")),($43,CAST($44::text AS "public"."document_type")),($45,CAST($46::text AS "public"."document_type")),($47,CAST($48::text AS "public"."document_type")),($49,CAST($50::text AS "public"."document_type"))) OFFSET $51
```

```
(پلن گرفته نشد: )
```

> ✅ بدون پیمایش کامل روی جدول بزرگ.

## جمع مبالغ روی همه ردیف‌های فیلترشده

### کوئری 1

```sql
SELECT SUM("total_amount"), SUM("tax_amount") FROM (SELECT "public"."invoices"."total_amount", "public"."invoices"."tax_amount" FROM "public"."invoices" LEFT JOIN "public"."financial_documents" AS "j1" ON ("j1"."id","j1"."type") = ("public"."invoices"."document_id","public"."invoices"."document_type") WHERE ("j1"."status" <> CAST($1::text AS "public"."document_status") AND ("j1"."id" IS NOT NULL)) OFFSET $2) AS "sub"
```

```
Aggregate  (cost=4516.55..4516.56 rows=1 width=64) (actual rows=1 loops=1)
  ->  Hash Join  (cost=1176.61..4316.44 rows=40020 width=16) (actual rows=40035 loops=1)
        Hash Cond: ((invoices.document_id = j1.id) AND (invoices.document_type = j1.type))
        ->  Seq Scan on invoices  (cost=0.00..2824.52 rows=60052 width=36) (actual rows=60052 loops=1)
        ->  Hash  (cost=976.44..976.44 rows=13345 width=20) (actual rows=13345 loops=1)
              Buckets: 16384  Batches: 1  Memory Usage: 806kB
              ->  Seq Scan on financial_documents j1  (cost=0.00..976.44 rows=13345 width=20) (actual rows=13345 loops=1)
                    Filter: ((id IS NOT NULL) AND (status <> ('DRAFT'::cstring)::document_status))
                    Rows Removed by Filter: 6680
```

> ✅ پیمایش کامل `invoices` روی 60,052 از 60,052 ردیف (100٪). این کوئری **تجمیعی** است و بخش بزرگی از جدول را می‌خواند؛ در این نسبت، خواندن ترتیبی از خواندن با ایندکس ارزان‌تر است و انتخاب planner درست است.

## داشبورد — گروه‌بندی اسناد بر اساس وضعیت

### کوئری 1

```sql
SELECT COUNT(*), SUM("public"."financial_documents"."total_amount"), "public"."financial_documents"."status"::text FROM "public"."financial_documents" WHERE "public"."financial_documents"."status" <> CAST($1::text AS "public"."document_status") GROUP BY "public"."financial_documents"."status" OFFSET $2
```

```
HashAggregate  (cost=1076.52..1076.59 rows=4 width=76) (actual rows=3 loops=1)
  Group Key: status
  Batches: 1  Memory Usage: 24kB
  ->  Seq Scan on financial_documents  (cost=0.00..976.44 rows=13345 width=12) (actual rows=13345 loops=1)
        Filter: (status <> ('DRAFT'::cstring)::document_status)
        Rows Removed by Filter: 6680
```

> ✅ پیمایش کامل `financial_documents` روی 13,345 از 20,025 ردیف (67٪). این کوئری **تجمیعی** است و بخش بزرگی از جدول را می‌خواند؛ در این نسبت، خواندن ترتیبی از خواندن با ایندکس ارزان‌تر است و انتخاب planner درست است.

## داشبورد — ده فروشنده با بیشترین مبلغ

### کوئری 1

```sql
SELECT SUM("public"."invoices"."total_amount"), COUNT(*), "public"."invoices"."vendor_id" FROM "public"."invoices" LEFT JOIN "public"."financial_documents" AS "j1" ON ("j1"."id","j1"."type") = ("public"."invoices"."document_id","public"."invoices"."document_type") WHERE (("j1"."status" <> CAST($1::text AS "public"."document_status") AND ("j1"."id" IS NOT NULL)) AND "public"."invoices"."vendor_id" IS NOT NULL) GROUP BY "public"."invoices"."vendor_id" ORDER BY SUM("public"."invoices"."total_amount") DESC LIMIT $2 OFFSET $3
```

```
Limit  (cost=4616.55..4616.56 rows=3 width=56) (actual rows=4 loops=1)
  ->  Sort  (cost=4616.55..4616.56 rows=3 width=56) (actual rows=4 loops=1)
        Sort Key: (sum(invoices.total_amount)) DESC
        Sort Method: quicksort  Memory: 25kB
        ->  HashAggregate  (cost=4616.49..4616.52 rows=3 width=56) (actual rows=4 loops=1)
              Group Key: invoices.vendor_id
              Batches: 1  Memory Usage: 24kB
              ->  Hash Join  (cost=1176.61..4316.39 rows=40013 width=24) (actual rows=40024 loops=1)
                    Hash Cond: ((invoices.document_id = j1.id) AND (invoices.document_type = j1.type))
                    ->  Seq Scan on invoices  (cost=0.00..2824.52 rows=60042 width=44) (actual rows=60037 loops=1)
                          Filter: (vendor_id IS NOT NULL)
                          Rows Removed by Filter: 15
                    ->  Hash  (cost=976.44..976.44 rows=13345 width=20) (actual rows=13345 loops=1)
                          Buckets: 16384  Batches: 1  Memory Usage: 806kB
                          ->  Seq Scan on financial_documents j1  (cost=0.00..976.44 rows=13345 width=20) (actual rows=13345 loops=1)
                                Filter: ((id IS NOT NULL) AND (status <> ('DRAFT'::cstring)::document_status))
                                Rows Removed by Filter: 6680
```

> ✅ پیمایش کامل `invoices` روی 60,037 از 60,052 ردیف (100٪). این کوئری **تجمیعی** است و بخش بزرگی از جدول را می‌خواند؛ در این نسبت، خواندن ترتیبی از خواندن با ایندکس ارزان‌تر است و انتخاب planner درست است.

## جزئیات یک سند با فاکتورهایش

### کوئری 1

```sql
SELECT "public"."financial_documents"."id", "public"."financial_documents"."title", "public"."financial_documents"."type"::text, "public"."financial_documents"."fiscal_year", "public"."financial_documents"."jalali_year", "public"."financial_documents"."status"::text, "public"."financial_documents"."buyer_entity_id", "public"."financial_documents"."buyer_snapshot_id", "public"."financial_documents"."document_number", "public"."financial_documents"."document_date", "public"."financial_documents"."rounding_policy", "public"."financial_documents"."total_gross", "public"."financial_documents"."total_discount", "public"."financial_documents"."total_net", "public"."financial_documents"."total_tax", "public"."financial_documents"."total_amount", "public"."financial_documents"."open_feedback_count", "public"."financial_documents"."created_by_id", "public"."financial_documents"."created_at", "public"."financial_documents"."updated_at", "public"."financial_documents"."finalized_at", "public"."financial_documents"."finalized_by_id", "public"."financial_documents"."archived_at" FROM "public"."financial_documents" WHERE "public"."financial_documents"."id" = $1 LIMIT $2 OFFSET $3
```

```
Limit  (cost=0.29..8.31 rows=1 width=304) (actual rows=1 loops=1)
  ->  Index Scan using financial_documents_id_type_key on financial_documents  (cost=0.29..8.31 rows=1 width=304) (actual rows=1 loops=1)
        Index Cond: (id = 'ef4ea3a6-560b-4df9-b382-d8bc446542fe'::uuid)
```

> ✅ بدون پیمایش کامل روی جدول بزرگ.

### کوئری 2

```sql
SELECT "public"."invoices"."id", "public"."invoices"."document_id", "public"."invoices"."document_type"::text, "public"."invoices"."invoice_type_id", "public"."invoices"."invoice_kind"::text, "public"."invoices"."chapter_id", "public"."invoices"."chapter_code_snapshot", "public"."invoices"."chapter_title_snapshot", "public"."invoices"."vendor_id", "public"."invoices"."vendor_snapshot_id", "public"."invoices"."buyer_snapshot_id", "public"."invoices"."invoice_number", "public"."invoices"."invoice_date", "public"."invoices"."tax_mode"::text, "public"."invoices"."tax_rate_bp", "public"."invoices"."gross_amount", "public"."invoices"."discount_amount", "public"."invoices"."net_amount", "public"."invoices"."tax_amount", "public"."invoices"."total_amount", "public"."invoices"."custom_fields", "public"."invoices"."custom_fields_schema_version", "public"."invoices"."notes", "public"."invoices"."sort_index", "public"."invoices"."created_by_id", "public"."invoices"."created_at", "public"."invoices"."updated_at" FROM "public"."invoices" WHERE ("public"."invoices"."document_id","public"."invoices"."document_type") IN (($1,CAST($2::text AS "public"."document_type"))) OFFSET $3
```

```
Bitmap Heap Scan on invoices  (cost=4.31..16.09 rows=3 width=394) (actual rows=3 loops=1)
  Recheck Cond: (document_id = 'ef4ea3a6-560b-4df9-b382-d8bc446542fe'::uuid)
  Filter: (document_type = ('NORMAL'::cstring)::document_type)
  Heap Blocks: exact=3
  ->  Bitmap Index Scan on invoices_document_id_vendor_id_idx  (cost=0.00..4.31 rows=3 width=0) (actual rows=3 loops=1)
        Index Cond: (document_id = 'ef4ea3a6-560b-4df9-b382-d8bc446542fe'::uuid)
```

> ✅ بدون پیمایش کامل روی جدول بزرگ.

### کوئری 3

```sql
SELECT "public"."invoice_items"."id", "public"."invoice_items"."invoice_id", "public"."invoice_items"."row_no", "public"."invoice_items"."product_code", "public"."invoice_items"."description", "public"."invoice_items"."quantity", "public"."invoice_items"."unit_id", "public"."invoice_items"."unit_price", "public"."invoice_items"."gross_amount", "public"."invoice_items"."discount_amount", "public"."invoice_items"."net_amount", "public"."invoice_items"."tax_mode"::text, "public"."invoice_items"."tax_rate_bp", "public"."invoice_items"."tax_amount", "public"."invoice_items"."total_amount" FROM "public"."invoice_items" WHERE "public"."invoice_items"."invoice_id" IN ($1,$2,$3) OFFSET $4
```

```
Seq Scan on invoice_items  (cost=0.00..3.34 rows=3 width=169) (actual rows=0 loops=1)
  Filter: (invoice_id = ANY ('{210696b3-675a-40ad-b152-1a83ba1cbb37,ff7ca87c-4a9c-418e-8393-cadc9c43bf48,e61f9bdf-db20-4fa9-a1de-edc3970648c9}'::uuid[]))
  Rows Removed by Filter: 56
```

> ✅ بدون پیمایش کامل روی جدول بزرگ.

## گزارش فعالیت کاربران — مرتب‌سازی زمانی سراسری

### کوئری 1

```sql
SELECT "public"."audit_logs"."id", "public"."audit_logs"."action", "public"."audit_logs"."entity_type", "public"."audit_logs"."created_at" FROM "public"."audit_logs" WHERE 1=1 ORDER BY "public"."audit_logs"."created_at" DESC, "public"."audit_logs"."id" ASC LIMIT $1 OFFSET $2
```

```
Limit  (cost=0.28..5.56 rows=25 width=54) (actual rows=25 loops=1)
  ->  Index Scan using audit_logs_created_at_id_idx on audit_logs  (cost=0.28..115.87 rows=547 width=54) (actual rows=25 loops=1)
```

> ✅ بدون پیمایش کامل روی جدول بزرگ.

## تجمیع با فیلتر باریک — یک سال مالی و یک وضعیت

### کوئری 1

```sql
SELECT SUM("total_amount") FROM (SELECT "public"."financial_documents"."total_amount" FROM "public"."financial_documents" WHERE ("public"."financial_documents"."fiscal_year" = $1 AND "public"."financial_documents"."status" = CAST($2::text AS "public"."document_status")) OFFSET $3) AS "sub"
```

```
Aggregate  (cost=758.70..758.71 rows=1 width=32) (actual rows=1 loops=1)
  ->  Bitmap Heap Scan on financial_documents  (cost=91.68..755.92 rows=1111 width=8) (actual rows=3334 loops=1)
        Recheck Cond: ((fiscal_year = '1401'::bigint) AND (status = ('FINALIZED'::cstring)::document_status))
        Heap Blocks: exact=626
        ->  Bitmap Index Scan on financial_documents_fiscal_year_status_type_created_at_idx  (cost=0.00..91.40 rows=1111 width=0) (actual rows=3334 loops=1)
              Index Cond: ((fiscal_year = '1401'::bigint) AND (status = ('FINALIZED'::cstring)::document_status))
```

> ✅ بدون پیمایش کامل روی جدول بزرگ.

## فهرست فاکتورهای یک سند — مسیر پرتکرار جزئیات سند

### کوئری 1

```sql
SELECT "public"."invoices"."id", "public"."invoices"."invoice_number", "public"."invoices"."total_amount" FROM "public"."invoices" WHERE "public"."invoices"."document_id" = $1 ORDER BY "public"."invoices"."invoice_date" ASC, "public"."invoices"."id" ASC OFFSET $2
```

```
Sort  (cost=16.04..16.05 rows=3 width=42) (actual rows=3 loops=1)
  Sort Key: invoice_date, id
  Sort Method: quicksort  Memory: 25kB
  ->  Bitmap Heap Scan on invoices  (cost=4.31..16.02 rows=3 width=42) (actual rows=3 loops=1)
        Recheck Cond: (document_id = 'ef4ea3a6-560b-4df9-b382-d8bc446542fe'::uuid)
        Heap Blocks: exact=3
        ->  Bitmap Index Scan on invoices_document_id_vendor_id_idx  (cost=0.00..4.31 rows=3 width=0) (actual rows=3 loops=1)
              Index Cond: (document_id = 'ef4ea3a6-560b-4df9-b382-d8bc446542fe'::uuid)
```

> ✅ بدون پیمایش کامل روی جدول بزرگ.

## جمع‌بندی

هیچ کوئری‌ای برای خواندن بخش کوچکی از یک جدول بزرگ، پیمایش کامل نمی‌کند. کوئری‌های تجمیعی که بخش بزرگی از جدول را می‌خوانند عمداً — و درست — ترتیبی خوانده می‌شوند؛ مرز تفکیک در این سند ۲۵٪ جدول است.
