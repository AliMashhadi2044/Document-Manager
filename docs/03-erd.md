
# ۰۳ — مدل داده و ERD

نام‌گذاری: جداول `snake_case` جمع، کلید اصلی `id` از نوع `uuid` (نسخه ۷ برای ترتیب زمانی)،
زمان رویدادها `timestamptz`، تاریخ‌های تقویمی `date` خالص، **تمام مبالغ `BIGINT` ریال صحیح**.

> مبالغ هرگز `NUMERIC` یا `DOUBLE` نیستند. دلیل و قرارداد انتقال در
> [ADR-0003](adr/ADR-0003-money-bigint-rial.md) و [08-financial-rules.md](08-financial-rules.md).

---

## ۱. هویت و دسترسی

```mermaid
erDiagram
  users ||--o{ user_roles : "دارد"
  roles ||--o{ user_roles : "شامل"
  roles ||--o{ role_permissions : "دارد"
  permissions ||--o{ role_permissions : "در"
  users ||--o{ sessions : "دارد"
  users ||--o{ security_events : "تولید"
  users ||--|| user_preferences : "دارد"

  users { uuid id PK
          text username UK
          text full_name
          text password_hash
          bool is_active
          int  failed_login_count
          timestamptz locked_until
          timestamptz last_login_at }
  roles { uuid id PK
          text key UK
          text title_fa
          bool is_system }
  permissions { uuid id PK
          text key UK
          text group_key
          text title_fa }
  sessions { uuid id PK
          uuid user_id FK
          text token_hash UK
          text csrf_token_hash
          inet ip
          timestamptz expires_at
          timestamptz revoked_at }
  user_preferences { uuid user_id PK
          text theme
          text primary_color
          text table_density
          int  page_size
          jsonb column_visibility }
```

نکته‌ها:

- `sessions.token_hash` هش توکن است، نه خود توکن؛ افشای دیتابیس به سرقت نشست منجر نمی‌شود.
- `security_events` رویدادهای ورود موفق/ناموفق، قفل حساب، تغییر رمز و خروج اجباری را نگه می‌دارد.
- نقش‌ها داده مرجع هستند (`is_system = true` برای کارپردازی/بایگانی/ناظر) و قابل حذف نیستند.

---

## ۲. اطلاعات پایه

```mermaid
erDiagram
  budget_categories ||--o{ budget_chapters : "شامل"
  budget_chapters   ||--o{ chapter_invoice_types : "مجاز"
  invoice_types     ||--o{ chapter_invoice_types : "در"
  payment_methods   ||--o{ invoice_types : "پیش_فرض"
  districts         ||--o{ schools : "شامل"
  vehicle_types     ||--o{ vehicles : "شامل"
  banks             ||--o{ vendor_bank_accounts : "صادرکننده"
  vendors           ||--o{ vendor_bank_accounts : "دارد"
  vendors           ||--o{ vendor_product_type_suggestions : "پیشنهاد"
  product_types     ||--o{ vendor_product_type_suggestions : "برای"
  organization_settings ||--o{ signatories : "دارد"

  budget_categories { uuid id PK
      text key UK
      text title_fa }
  budget_chapters { uuid id PK
      uuid category_id FK
      text title
      text code
      bool is_active
      int  sort_order }
  invoice_types { uuid id PK
      text key UK
      text kind
      text title_fa
      uuid default_payment_method_id FK
      jsonb custom_field_schema
      int  custom_field_schema_version
      bool is_active }
  chapter_invoice_types { uuid chapter_id PK
      uuid invoice_type_id PK
      bool is_default
      int  sort_order }
  tax_rates { uuid id PK
      int  fiscal_year
      uuid invoice_type_id FK
      uuid chapter_id FK
      int  rate_bp }
  buyer_entities { uuid id PK
      text person_type
      text name
      text economic_code
      text registration_number
      text national_id
      text address
      text postal_code
      bool is_active }
  vendors { uuid id PK
      text person_type
      text name
      text representative_name
      text economic_code
      text registration_number
      text national_id
      text address
      text postal_code
      bool is_active }
  vendor_bank_accounts { uuid id PK
      uuid vendor_id FK
      text iban_normalized UK
      uuid bank_id FK
      text account_title
      bool is_default
      bool is_active }
```

سایر جداول اطلاعات پایه با همین الگو (`id`, `title`, `code?`, `is_active`, `sort_order`):
`utility_types`, `fuel_types`, `stad_request_types`, `product_types`, `measurement_units`,
`fiscal_years`, `signatories`, `banks`, `payment_methods`, `system_settings`.

قواعد مشترک اطلاعات پایه:

- **حذف نمی‌شوند**؛ `is_active = false` می‌شوند. تلاش برای حذف رکورد استفاده‌شده با خطای
  صریح و شمارش اسناد مرتبط رد می‌شود (الزام §۸.۱۰ پرامپت).
- رکورد غیرفعال در فرم **سند جدید** قابل انتخاب نیست، اما اسناد قبلی کاملاً سالم می‌مانند،
  چون مقادیر نمایشی در فاکتور snapshot شده‌اند.
- `fiscal_years` برای پر کردن فهرست سال مالی و امکان **بستن** سال استفاده می‌شود؛ ورود دستی
  سال همچنان مجاز است ولی سال بسته برای سند جدید رد می‌شود.

---

## ۳. هسته: سند، فاکتور و snapshotها

```mermaid
erDiagram
  financial_documents ||--o| document_stad_metadata : "دارد"
  financial_documents ||--o{ invoices : "شامل"
  financial_documents ||--o{ document_revisions : "نسخه"
  financial_documents ||--o{ document_status_transitions : "تاریخچه"
  financial_documents ||--o| archive_metadata : "بایگانی"
  financial_documents ||--o{ attachments : "اسکن"
  financial_documents ||--o{ review_feedbacks : "بازخورد"
  buyer_entities      ||--o{ financial_documents : "خریدار"
  buyer_snapshots     ||--o{ financial_documents : "snapshot"
  buyer_snapshots     ||--o{ invoices : "snapshot"

  invoices ||--o{ invoice_items : "اقلام"
  invoices ||--o| invoice_utility_details : "انشعاب"
  invoices ||--o| invoice_fuel_details : "سوخت"
  invoices ||--o| invoice_payments : "پرداخت"
  invoice_fuel_details ||--o{ fuel_entries : "ردیف"
  vendors         ||--o{ invoices : "فروشنده"
  vendor_snapshots ||--o{ invoices : "snapshot"
  invoice_types   ||--o{ invoices : "نوع"
  budget_chapters ||--o{ invoices : "فصل"

  financial_documents { uuid id PK
      text title
      int  fiscal_year
      int  jalali_year
      text type
      text status
      uuid buyer_entity_id FK
      uuid buyer_snapshot_id FK
      text document_number
      date document_date
      bigint total_gross
      bigint total_discount
      bigint total_net
      bigint total_tax
      bigint total_amount
      int  open_feedback_count
      uuid current_revision_id
      timestamptz finalized_at
      timestamptz archived_at }
  document_stad_metadata { uuid document_id PK
      text need_number
      text workflow_number
      text request_number
      uuid request_type_id FK
      text notes }
  invoices { uuid id PK
      uuid document_id FK
      text document_type
      uuid invoice_type_id FK
      text invoice_kind
      uuid chapter_id FK
      text chapter_code_snapshot
      text chapter_title_snapshot
      uuid vendor_id FK
      uuid vendor_snapshot_id FK
      uuid buyer_snapshot_id FK
      text invoice_number
      date invoice_date
      text tax_mode
      int  tax_rate_bp
      bigint gross_amount
      bigint discount_amount
      bigint net_amount
      bigint tax_amount
      bigint total_amount
      jsonb custom_fields
      text notes }
  invoice_items { uuid id PK
      uuid invoice_id FK
      int  row_no
      text product_code
      text description
      numeric quantity
      uuid unit_id FK
      bigint unit_price
      bigint gross_amount
      bigint discount_amount
      bigint net_amount
      text tax_mode
      int  tax_rate_bp
      bigint tax_amount
      bigint total_amount }
  invoice_utility_details { uuid invoice_id PK
      uuid school_id FK
      uuid district_id FK
      text school_title_snapshot
      text district_title_snapshot
      uuid utility_type_id FK
      text utility_type_title_snapshot
      bigint base_amount }
  invoice_fuel_details { uuid invoice_id PK
      uuid vehicle_type_id FK
      uuid vehicle_id FK
      text plate_snapshot
      uuid fuel_type_id FK
      int  jalali_year
      int  jalali_month }
  fuel_entries { uuid id PK
      uuid invoice_id FK
      int  jalali_day
      date gregorian_date
      bigint amount
      text note }
  invoice_payments { uuid invoice_id PK
      uuid payment_method_id FK
      text method_kind
      uuid vendor_bank_account_id FK
      text iban_snapshot
      text bank_title_snapshot
      text payment_identifier
      text bill_identifier
      text payee_name
      uuid petty_cash_holder_id FK }
```

**شرح ردیف فرم ریزهزینه** در `invoice_report_titles` می‌نشیند و نه در
`invoices.description`: شرح فاکتور حقیقتِ تاریخیِ سند است و عبارتی که روی فرم چاپ
می‌شود یک تصمیم گزارش. کلیدش خودِ فاکتور است (هر ردیفِ فرم یک فاکتور) و دقیقاً یکی
از `product_type_id` یا `custom_title` را دارد — همان قاعدهٔ «نوع کالا»ی گزارش
مالیات، با کلیدی دیگر.

### ۳.۱ چرا snapshot در جدول، نه JSON

`vendor_snapshots` و `buyer_snapshots` جداول **تغییرناپذیر** با ستون‌های تایپ‌شده‌اند، نه
یک ستون JSON. دلیل: گزارش مالیات باید روی همین اطلاعات تاریخی **فیلتر، مرتب‌سازی و تجمیع**
کند؛ با JSON بی‌schema این کار به کوئری‌های شکننده و غیرقابل ایندکس تبدیل می‌شود.
([ADR-0005](adr/ADR-0005-snapshot-tables.md))

هر فاکتور **ردیف snapshot اختصاصی خودش** را دارد (به اشتراک گذاشته نمی‌شود) تا هیچ مسیری
برای بازنویسی ناخواسته اطلاعات تاریخی وجود نداشته باشد. ردیف‌های snapshot `UPDATE` نمی‌شوند؛
این قاعده با مجوز سطح دیتابیس (REVOKE UPDATE از نقش برنامه) نیز قابل تثبیت است.

مقادیر snapshot فصل، مدرسه، ناحیه، نوع انشعاب، پلاک و شبا به‌صورت ستون `*_snapshot`
کنار FK زنده نگهداری می‌شوند: FK برای گزارش‌گیری و پیشنهادها، snapshot برای نمایش تاریخی.

### ۳.۲ خریدار

خریدار در **سطح سند** انتخاب می‌شود (`financial_documents.buyer_entity_id`) و در لحظه ایجاد
سند snapshot می‌شود. هر فاکتور به **همان** `buyer_snapshot_id` اشاره می‌کند تا فاکتور
خودبسنده باشد و خروجی فاکتور بدون join به سند قابل تولید باشد. (تصمیم B13 — نیازمند تأیید)

### ۳.۳ محدودیت یک فاکتور در سند ستاد

```sql
ALTER TABLE financial_documents ADD CONSTRAINT financial_documents_id_type_uk
  UNIQUE (id, type);

ALTER TABLE invoices ADD CONSTRAINT invoices_document_fk
  FOREIGN KEY (document_id, document_type)
  REFERENCES financial_documents (id, type)
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX invoices_one_per_stad_document_uk
  ON invoices (document_id) WHERE document_type = 'STAD';
```

این سه‌گانه سه چیز را **در سطح دیتابیس** تضمین می‌کند:

1. سند ستاد بیش از یک فاکتور نمی‌گیرد — حتی با دو درخواست همزمان (ریسک R7).
2. `invoices.document_type` هرگز نمی‌تواند با نوع واقعی سند ناسازگار شود.
3. تغییر نوع سند از «عادی» به «ستاد» وقتی دو فاکتور دارد، با cascade منتشر می‌شود و
   ایندکس یکتا تراکنش را **رد** می‌کند — یعنی همان رفتار مطلوب، بدون نوشتن کد نگهبان.

### ۳.۴ تغییرات ناشی از پاسخ‌های کارفرما

| تغییر | جزئیات |
|---|---|
| **فروشنده روی همه انواع فاکتور** (Q1) | `invoices.vendor_id` و `vendor_snapshot_id` برای هر چهار `kind` قابل استفاده‌اند و `nullable` می‌مانند (اختیاری). |
| **سیاست گرد کردن** (Q3) | ستون `financial_documents.rounding_policy jsonb NOT NULL` — snapshot از تنظیمات سازمان در لحظه ایجاد سند، قفل‌شده پس از ثبت نهایی. [ADR-0012](adr/ADR-0012-rounding-policy-snapshot.md) |
| **نرخ مالیات ۱۰٪** (Q4) | ردیف seed در `tax_rates` با `rate_bp = 1000`؛ بدون hardcode در کد. |
| **کارپرداز تنخواه** (Q9) | `invoice_payments.petty_cash_holder_id` به فهرست افراد/کاربران + `notes`. |

### ۳.۵ ستون‌های جمع ذخیره‌شده

`financial_documents.total_*` و `invoices.*_amount` مقادیر **محاسبه‌شده و ذخیره‌شده** هستند
(نه generated column، چون از جدول فرزند جمع می‌شوند). قاعده:

- فقط لایه `financial` آن‌ها را می‌نویسد، همیشه داخل همان تراکنشی که ردیف‌ها را تغییر می‌دهد.
- در هر ثبت نهایی، بازمحاسبه و تطبیق انجام می‌شود؛ اختلاف = خطا، نه تصحیح خودکار.
- یک کوئری تطبیق (reconciliation) در تست یکپارچه و در job سلامت دوره‌ای اجرا می‌شود:
  جمع ردیف‌ها باید با جمع ذخیره‌شده فاکتور و جمع فاکتورها با جمع سند **برابر** باشد.

---

## ۴. نسخه‌بندی سند، بایگانی، بازخورد

```mermaid
erDiagram
  financial_documents ||--o{ document_revisions : "نسخه"
  document_revisions  ||--o{ report_runs : "مبنای_خروجی"
  financial_documents ||--o| archive_metadata : "بایگانی"
  financial_documents ||--o{ attachments : "فایل"
  financial_documents ||--o{ review_feedbacks : "بازخورد"
  review_feedbacks ||--o{ review_feedback_replies : "پاسخ"
  review_feedbacks ||--o{ review_feedback_status_history : "تاریخچه"
  invoices ||--o{ review_feedbacks : "هدف"
  invoice_items ||--o{ review_feedbacks : "هدف"

  document_revisions { uuid id PK
      uuid document_id FK
      int  revision_no
      int  schema_version
      text trigger
      jsonb snapshot
      text reason
      uuid created_by FK
      timestamptz created_at }
  archive_metadata { uuid document_id PK
      text archive_status
      text notes
      uuid archived_by FK
      timestamptz archived_at }
  attachments { uuid id PK
      uuid document_id FK
      text kind
      text storage_key UK
      text original_filename
      text declared_mime
      text detected_mime
      bigint size_bytes
      text checksum_sha256
      int  page_count
      text scan_status
      uuid uploaded_by FK
      timestamptz deleted_at }
  review_feedbacks { uuid id PK
      uuid document_id FK
      text target_kind
      uuid invoice_id FK
      uuid invoice_item_id FK
      text section_key
      text body
      text status
      uuid created_by FK }
```

- **`document_revisions.snapshot`** تنها جایی است که JSON بی‌ساختار پذیرفته می‌شود، چون
  هدفش بازسازی وضعیت گذشته است نه کوئری‌پذیری. `schema_version` تضمین می‌کند خواننده آینده
  بتواند نسخه‌های قدیمی را درست تفسیر کند. ([ADR-0009](adr/ADR-0009-document-revisions.md))
- **شماره و تاریخ سند** تنها در `financial_documents` نگهداری می‌شوند (نه در
  `archive_metadata`) تا دو منبع حقیقت ایجاد نشود؛ ایندکس یکتایی و فیلترها هم همان‌جا
  طبیعی‌اند. `archive_metadata` فقط اطلاعات **فرایند** بایگانی را دارد.
- **بازخورد حذف نمی‌شود**؛ فقط وضعیتش تغییر می‌کند و هر تغییر در
  `review_feedback_status_history` ثبت می‌شود.
- `attachments.deleted_at` تنها soft-delete پروژه است و معنای عملیاتی روشن دارد: فایل از
  UI حذف شده ولی برای ردپای حسابرسی باقی می‌ماند. شیء ذخیره‌سازی طبق سیاست retention پاک می‌شود.

---

## ۵. گزارش‌گیری، حسابرسی و زیرساخت

```mermaid
erDiagram
  report_types ||--o{ report_definitions : "نوع"
  report_definitions ||--o{ report_versions : "نسخه"
  report_definitions ||--o{ report_runs : "اجرا"
  report_versions ||--o{ report_runs : "با_نسخه"
  attachments ||--o| report_runs : "خروجی"
  financial_documents ||--o{ document_vendor_product_types : "نوع_کالا"
  vendors ||--o{ document_vendor_product_types : "فروشنده"
  product_types ||--o{ document_vendor_product_types : "نوع"

  report_types { uuid id PK
      text key
      text title_fa
      text data_scope_key
      uuid active_definition_id FK }
  report_definitions { uuid id PK
      uuid report_type_id FK
      text name
      text status
      uuid current_version_id
      uuid created_by FK }
  report_versions { uuid id PK
      uuid definition_id FK
      int  version_no
      int  template_schema_version
      jsonb template
      text status
      timestamptz published_at }
  report_runs { uuid id PK
      uuid definition_id FK
      uuid version_id FK
      uuid document_id FK
      uuid document_revision_id FK
      jsonb params
      text status
      text output_format
      uuid output_attachment_id FK
      int  row_count
      int  duration_ms
      uuid requested_by FK
      timestamptz expires_at }
  document_vendor_product_types { uuid document_id PK
      uuid vendor_id PK
      uuid product_type_id FK
      uuid set_by FK
      timestamptz set_at }
  audit_logs { uuid id PK
      uuid actor_id FK
      text action
      text entity_type
      uuid entity_id
      uuid document_id FK
      jsonb before
      jsonb after
      text_array changed_fields
      text reason
      text trace_id
      timestamptz created_at }
  idempotency_keys { text key PK
      uuid user_id FK
      text endpoint
      text request_hash
      int  response_status
      jsonb response_body
      timestamptz expires_at }
```

- `report_versions.template` پس از `PUBLISHED` شدن **تغییرناپذیر** است؛ ویرایش، نسخه جدید
  می‌سازد. بنابراین خروجی تاریخی با تغییر قالب خراب نمی‌شود.
- `report_runs` هم `version_id` و هم `document_revision_id` را نگه می‌دارد؛ یعنی هر خروجی
  تاریخی **قابل بازتولید بیت‌به‌بیت** است.
- «نوع کالا» در گزارش مالیات به کلید `(document_id, vendor_id)` بسته است، نه به فروشنده
  به‌تنهایی — چون یک فروشنده در سندهای مختلف نوع کالای متفاوت دارد. پیشنهادهای اختصاصی
  همان فروشنده در `vendor_product_type_suggestions` با شمارش استفاده نگهداری می‌شوند.
- `audit_logs` فقط `changed_fields` و مقادیر لازم را نگه می‌دارد؛ فیلدهای حساس
  (هش رمز، توکن) هرگز وارد `before`/`after` نمی‌شوند.

---

## ۶. constraintهای کلیدی

| موضوع | قاعده |
|---|---|
| یکتایی سند | `UNIQUE (fiscal_year, document_number) WHERE document_number IS NOT NULL` — **تأییدشده (Q5 گزینه الف): یکتا در هر سال مالی** |
| یک فاکتور ستاد | `UNIQUE (document_id) WHERE document_type = 'STAD'` |
| شبا | `UNIQUE (iban_normalized)` سراسری؛ `UNIQUE (vendor_id) WHERE is_default` |
| شناسه فروشنده | `UNIQUE (economic_code) WHERE NOT NULL`، `UNIQUE (national_id) WHERE NOT NULL` |
| فصل | `UNIQUE (category_id, code) WHERE code IS NOT NULL` |
| پلاک خودرو | `UNIQUE (plate_normalized)` |
| ردیف فاکتور | `UNIQUE (invoice_id, row_no)` |
| نسخه سند | `UNIQUE (document_id, revision_no)` |
| نسخه قالب | `UNIQUE (definition_id, version_no)` |
| نوع فاکتور پیش‌فرض فصل | `UNIQUE (chapter_id) WHERE is_default` |
| علامت مبالغ | `CHECK (gross_amount >= 0 AND discount_amount >= 0 AND net_amount >= 0 AND tax_amount >= 0)` |
| سازگاری تخفیف | `CHECK (discount_amount <= gross_amount)` — قابل تنظیم با سیاست، پیش‌فرض فعال |
| اتحاد محاسبه ردیف | `CHECK (net_amount = gross_amount - discount_amount AND total_amount = net_amount + tax_amount)` |
| حالت مالیات | `CHECK ((tax_mode='PERCENT' AND tax_rate_bp IS NOT NULL) OR (tax_mode='AMOUNT' AND tax_rate_bp IS NULL))` |
| روز سوخت | `CHECK (jalali_day BETWEEN 1 AND 31)` + اعتبارسنجی دقیق ماه در لایه دامنه |
| ماه شمسی | `CHECK (jalali_month BETWEEN 1 AND 12)` |
| حذف آبشاری | روی داده مالی **ممنوع**؛ فقط `invoice_items`، `fuel_entries` و جداول جزئیات ۱:۱ با `ON DELETE CASCADE` از فاکتور. حذف فاکتور فقط در وضعیت پیش‌نویس مجاز است. |

## ۷. ایندکس‌ها (بر اساس کوئری‌های واقعی، نه حدس)

| کوئری | ایندکس |
|---|---|
| فهرست اسناد با فیلتر سال/وضعیت/نوع | `(fiscal_year, status, type, created_at DESC)` |
| جست‌وجوی شماره سند | `(document_number)` + ایندکس یکتای جزئی موجود |
| مرتب‌سازی فاکتورهای سند (قاعده §۹) | `(document_id, invoice_date ASC, id ASC)` |
| فاکتورهای یک فروشنده در بازه | `(vendor_id, invoice_date)` |
| تجمیع گزارش مالیات برای یک سند | `(document_id, vendor_id)` روی `invoices` |
| اقلام یک فاکتور | `(invoice_id, row_no)` |
| ردیف‌های سوخت | `(invoice_id, jalali_day, id)` |
| جست‌وجوی فروشنده (نام/شناسه) | GIN روی `to_tsvector('simple', name)` + ایندکس ساده روی شناسه‌ها |
| تاریخچه یک سند | `(document_id, created_at DESC)` روی `audit_logs` |
| کارتابل بازخورد | `(status, document_id)` و `(document_id, status)` روی `review_feedbacks` |
| صف خروجی‌ها | `(status, requested_at)` روی `report_runs` |
| پاک‌سازی خروجی منقضی | `(expires_at)` روی `report_runs` |

ایندکس‌ها در فاز مربوطه با `EXPLAIN (ANALYZE, BUFFERS)` روی داده واقع‌بینانه بررسی و
در [11-testing-plan.md](11-testing-plan.md) گزارش می‌شوند — بدون حدس زدن درباره کارایی.
