
# ۰۴ — فرهنست داده (Data Dictionary)

این سند **نسخه اولیه** است و در فازهای ۱ تا ۳ از schema واقعی Prisma و تعریف
Data Dictionary موتور گزارش **تولید خودکار** می‌شود تا هرگز از کد عقب نماند.
در فاز صفر فیلدهای کلیدی و قراردادهای واحد آن‌ها را تثبیت می‌کند.

## ۱. قراردادهای عمومی

| موضوع | قرارداد |
|---|---|
| شناسه | `uuid` نسخه ۷ |
| مبلغ | `BIGINT` ریال صحیح · در API **رشته عددی** · در TS `bigint` |
| تعداد | `NUMERIC(18,3)` · در API رشته · در TS `bigint` مقیاس هزارم |
| درصد / نرخ | `INTEGER` basis point (۹٪ = ۹۰۰) |
| تاریخ تقویمی | `DATE` (بدون ساعت، بدون timezone) · در API `YYYY-MM-DD` |
| زمان رویداد | `TIMESTAMPTZ` · در API ISO-8601 در UTC |
| سال مالی / سال شمسی | `INTEGER` چهاررقمی، **دو فیلد مستقل** |
| متن کوتاه | `VARCHAR(n)` با سقف مشخص |
| متن بلند | `TEXT` با سقف اعتبارسنجی در Zod |
| پرچم فعال | `BOOLEAN NOT NULL DEFAULT true` |

## ۲. فیلدهای سند (`financial_documents`)

| فیلد | نوع | واحد | الزامی | منبع | توضیح |
|---|---|---|---|---|---|
| `id` | uuid | — | ✅ | سیستم | |
| `title` | varchar(500) | — | ✅ | کاربر | شرح سند |
| `fiscal_year` | int | سال | ✅ | کاربر (انتخاب یا تایپ) | **مستقل** از سال شمسی |
| `jalali_year` | int | سال | ✅ | کاربر (انتخاب یا تایپ) | مبنای تاریخ سوخت‌گیری |
| `type` | enum | — | ✅ | کاربر | `NORMAL` \| `STAD` |
| `status` | enum | — | ✅ | سیستم | شش وضعیت سند ۰۷ |
| `buyer_entity_id` | uuid | — | ✅ | اطلاعات پایه | مجموعه خریدار انتخابی |
| `buyer_snapshot_id` | uuid | — | ✅ | سیستم | تصویر لحظه ایجاد |
| `document_number` | varchar(50) | — | ⬜ | **بایگانی** | یکتا در هر **سال مالی** (تأییدشده) |
| `document_date` | date | — | ⬜ | **بایگانی** | تاریخ سند |
| `total_gross` | bigint | ریال | ✅ | محاسبه | Σ فاکتورها، قبل از تخفیف |
| `total_discount` | bigint | ریال | ✅ | محاسبه | |
| `total_net` | bigint | ریال | ✅ | محاسبه | |
| `total_tax` | bigint | ریال | ✅ | محاسبه | مالیات و عوارض |
| `total_amount` | bigint | ریال | ✅ | محاسبه | `total_net + total_tax` |
| `open_feedback_count` | int | عدد | ✅ | سیستم | شاخص «دارای بازخورد» |
| `current_revision_id` | uuid | — | ⬜ | سیستم | آخرین نسخه |
| `finalized_at` / `finalized_by` | timestamptz / uuid | — | ⬜ | سیستم | |
| `archived_at` / `archived_by` | timestamptz / uuid | — | ⬜ | سیستم | |

### فراداده ستاد (`document_stad_metadata`)

| فیلد | نوع | الزامی | توضیح |
|---|---|---|---|
| `need_number` | varchar(**50**) | ✅ | شماره نیاز — سقف ۵۰ نویسه (الزام §۹) |
| `workflow_number` | varchar(100) | ✅ | شماره گردش |
| `request_number` | varchar(100) | ✅ | شماره درخواست |
| `request_type_id` | uuid | ✅ | از `stad_request_types` |
| `notes` | text | ⬜ | توضیحات |

## ۳. فیلدهای فاکتور (`invoices`)

| فیلد | نوع | واحد | الزامی | توضیح |
|---|---|---|---|---|
| `document_id` | uuid | — | ✅ | |
| `document_type` | enum | — | ✅ | denormal، برای constraint ستاد |
| `invoice_type_id` | uuid | — | ✅ | از `invoice_types` |
| `invoice_kind` | enum | — | ✅ | `NORMAL`\|`STAD`\|`UTILITY`\|`FUEL` |
| `chapter_id` | uuid | — | ✅ | فصل بودجه |
| `chapter_code_snapshot` | varchar(50) | — | ⬜ | تصویر کد فصل |
| `chapter_title_snapshot` | varchar(200) | — | ✅ | تصویر عنوان فصل |
| `vendor_id` | uuid | — | ⬜ | روی **همه** انواع فاکتور، اختیاری (تأییدشده) |
| `vendor_snapshot_id` | uuid | — | ⬜ | اطلاعات تاریخی فروشنده |
| `buyer_snapshot_id` | uuid | — | ✅ | همان snapshot سند |
| `invoice_number` | varchar(100) | — | ⬜ | شماره صورتحساب |
| `invoice_date` | date | — | ✅ | **تاریخ صورتحساب** — مبنای مرتب‌سازی و گزارش |
| `tax_mode` | enum | — | ✅ | `PERCENT` \| `AMOUNT` |
| `tax_rate_bp` | int | bp | ⬜ | فقط در حالت `PERCENT` |
| `gross_amount` … `total_amount` | bigint | ریال | ✅ | پنج ستون مالی |
| `custom_fields` | jsonb | — | ⬜ | فیلدهای توسعه‌پذیر، **بدون مبلغ** |
| `notes` | text | — | ⬜ | توضیحات اختصاصی |

### قلم فاکتور (`invoice_items`)

| فیلد | نوع | واحد | توضیح |
|---|---|---|---|
| `row_no` | int | — | شماره ردیف، یکتا در فاکتور |
| `product_code` | varchar(100) | — | کد کالا |
| `description` | varchar(1000) | — | شرح کالا یا خدمت |
| `quantity` | numeric(18,3) | مقدار | تعداد یا مقدار |
| `unit_id` | uuid | — | واحد اندازه‌گیری، اختیاری (تأییدشده) |
| `unit_price` | bigint | ریال | مبلغ واحد |
| `gross_amount` | bigint | ریال | `qty × unit_price` گرد‌شده |
| `discount_amount` | bigint | ریال | تخفیف |
| `net_amount` | bigint | ریال | `gross − discount` |
| `tax_mode` / `tax_rate_bp` / `tax_amount` | enum / int / bigint | — / bp / ریال | مالیات و عوارض |
| `total_amount` | bigint | ریال | `net + tax` |

### جزئیات انشعابات (`invoice_utility_details`)

`school_id`, `district_id`, `utility_type_id` + سه ستون `*_title_snapshot` + `base_amount` (ریال).

### جزئیات سوخت (`invoice_fuel_details` + `fuel_entries`)

| فیلد | نوع | توضیح |
|---|---|---|
| `vehicle_type_id` / `vehicle_id` / `fuel_type_id` | uuid | از اطلاعات پایه |
| `plate_snapshot` | varchar(50) | تصویر پلاک |
| `jalali_year` | int | پیش‌فرض از سند |
| `jalali_month` | int | ۱–۱۲ |
| `fuel_entries.jalali_day` | int | ۱–۳۱، با اعتبارسنجی دقیق ماه |
| `fuel_entries.gregorian_date` | date | **محاسبه سروری** از (سال، ماه، روز) |
| `fuel_entries.amount` | bigint | ریال |

### پرداخت (`invoice_payments`)

| فیلد | نوع | شرط |
|---|---|---|
| `method_kind` | enum | `BENEFICIARY_ACCOUNT` \| `PETTY_CASH` \| `BILL` \| `SPLIT` |
| `vendor_bank_account_id` | uuid | `BENEFICIARY_ACCOUNT` و `SPLIT` |
| `iban_snapshot` | char(26) | تصویر شبا در لحظه ثبت |
| `bank_title_snapshot` | varchar(100) | نام بانک تشخیص‌داده‌شده |
| `payment_identifier` | varchar(100) | شناسه پرداخت — **متعلق به فاکتور، نه به شبا** |
| `bill_identifier` | varchar(100) | فقط `BILL` |
| `petty_cash_holder_id` | uuid | `PETTY_CASH` (اختیاری) و `SPLIT` (الزامی) — انتخاب از فهرست تنخواه‌داران |
| `beneficiary_amount` | bigint | فقط `SPLIT` — سهم ذی‌نفع |
| `petty_cash_amount` | bigint | فقط `SPLIT` — سهم کارپرداز |

**پرداخت ترکیبی.** یک فاکتور همیشه یک مقصد ندارد: بخشی نقداً دست کارپرداز رفته و
بخش دیگر باید به حساب ذی‌نفع واریز شود. دو ستون بالا **تکرار** مبلغ فاکتور نیستند،
تقسیم آن‌اند — جمعشان دقیقاً `invoices.total_amount` است و همین را یک تریگر
`DEFERRABLE` تضمین می‌کند، نه فقط لایهٔ سرویس (قاعدهٔ «مبالغ فقط یک‌جا زندگی
می‌کنند»). به تعویق افتادن لازم است چون ردیف‌ها و پرداخت در یک تراکنش نوشته می‌شوند
و مبلغ نهایی فاکتور ممکن است بعد از ردیف پرداخت بنشیند.

## ۴. فروشنده و خریدار

| فیلد | نوع | فروشنده | خریدار | توضیح |
|---|---|:--:|:--:|---|
| `person_type` | enum | ✅ | ✅ | `NATURAL` (حقیقی) \| `LEGAL` (حقوقی) |
| `name` | varchar(300) | ✅ | ✅ | نام شخص یا عنوان حقوقی |
| `representative_name` | varchar(200) | ⬜ | — | فقط حقوقی، **اختیاری** |
| `economic_code` | varchar(30) | ⬜ | ⬜ | شماره اقتصادی |
| `registration_number` | varchar(30) | ⬜ | ⬜ | شماره ثبت |
| `national_id` | varchar(20) | ⬜ | ⬜ | شماره ملی یا شناسه ملی |
| `address` | text | ⬜ | ⬜ | |
| `postal_code` | varchar(10) | ⬜ | ⬜ | |
| `phone` / `fax` | varchar(30) | ⬜ | ⬜ | |

جداول `vendor_snapshots` و `buyer_snapshots` **همین فیلدها** را دارند، به‌علاوه
`captured_at` و FK اختیاری به رکورد زنده. ردیف snapshot هرگز `UPDATE` نمی‌شود.

## ۵. حساب بانکی فروشنده (`vendor_bank_accounts`)

| فیلد | نوع | توضیح |
|---|---|---|
| `iban` | varchar(34) | مقدار ورودی کاربر (برای نمایش) |
| `iban_normalized` | char(26) | `IR` + ۲۴ رقم ASCII — یکتا و مبنای مقایسه |
| `bank_id` | uuid | تشخیص‌شده از پیشوند؛ ناشناخته → `NULL` |
| `account_title` | varchar(200) | عنوان حساب |
| `is_default` | boolean | حداکثر یکی فعال در هر فروشنده |
| `is_active` | boolean | غیرفعال‌سازی بدون حذف |

## ۵.۵ اشخاص سازمان

دو جدول کوچک که تا مدت‌ها فقط از راه seed پر می‌شدند و هیچ رابطی نداشتند؛ یعنی نام
پای گزارش‌ها قابل تغییر نبود و تنخواه‌دار اصلاً انتخاب‌شدنی نبود.

### امضاکنندگان (`signatories`)

| فیلد | نوع | توضیح |
|---|---|---|
| `full_name` | varchar(200) | نامی که پای خروجی چاپ می‌شود |
| `position_title` | varchar(200) | سمت، زیر نام |
| `role_key` | varchar(50) | `PROCUREMENT_LEAD` \| `GENERAL_MANAGER` \| `OTHER` |
| `sort_order` | integer | اگر یک نقش چند نفر دارد، کوچک‌ترین انتخاب می‌شود |

قالب گزارش فقط `role_key` را نگه می‌دارد؛ نام و سمت در **لحظهٔ تولید خروجی** خوانده
می‌شوند. پس عوض شدن مسئول کارپردازی یک اصلاح در اطلاعات پایه است، نه بازطراحی
قالب‌ها — و خروجی‌های گرفته‌شده، که نسخهٔ snapshot خودشان را دارند، دست‌نخورده
می‌مانند.

### تنخواه‌داران (`petty_cash_holders`)

| فیلد | نوع | توضیح |
|---|---|---|
| `full_name` | varchar(200) | نام تنخواه‌دار |
| `account_holder_name` | varchar(200) | نام صاحب حساب؛ خالی یعنی به نام خودش |
| `bank_code` | varchar(3) | از شبا تشخیص داده می‌شود، جدا پرسیده نمی‌شود |
| `iban` / `iban_normalized` | varchar | همان قرارداد حساب فروشنده |
| `account_number` | varchar(50) | اختیاری، کنار شبا |

**چرا جدا از `users`**: تنخواه‌دار لزوماً کاربر سامانه نیست و اطلاعاتی دارد (صاحب
حساب، بانک، شبا) که به حساب کاربری ربطی ندارد. تا پیش از این `petty_cash_holder_id`
به `users` اشاره می‌کرد، پس تعریف تنخواه‌دار در گرو ساختن حساب کاربری بود و فرم
فاکتور عملاً هیچ‌وقت کسی را انتخاب نمی‌کرد.

**snapshot در پرداخت.** `invoice_payments` چهار ستون `petty_cash_*_snapshot` دارد
(نام، صاحب حساب، بانک، شبا) که در لحظهٔ ثبت پر می‌شوند؛ گزارش از همان‌ها می‌خواند،
نه از اطلاعات پایهٔ امروز. اصلاح بعدی اطلاعات پایه، فاکتور تاریخی را عوض نمی‌کند
(ADR-0005).

## ۶. متغیرهای موتور گزارش

فهرست منابع داده، مجوز هر کدام و قابلیت استفاده در شرط/محاسبه در
[09-report-engine.md](09-report-engine.md) §۳ آمده است. هر فیلد در آن فهرست دارای:
`key` (پایدار و تغییرناپذیر)، `titleFa` (آزادانه قابل تغییر)، `type`،
`requiredPermissions`، `usableInCondition`، `usableInCalculation` و `defaultFormat` است.

## ۷. شمارش‌ها (Enums)

| شمارش | مقادیر |
|---|---|
| `DocumentType` | `NORMAL`, `STAD` |
| `DocumentStatus` | `DRAFT`, `FINALIZED`, `PENDING_ARCHIVE`, `ARCHIVED`, `NEEDS_REVISION`, `REOPENED` |
| `InvoiceKind` | `NORMAL`, `STAD`, `UTILITY`, `FUEL` |
| `PersonType` | `NATURAL`, `LEGAL` |
| `TaxMode` | `PERCENT`, `AMOUNT` |
| `PaymentMethodKind` | `BENEFICIARY_ACCOUNT`, `PETTY_CASH`, `BILL` |
| `BudgetCategoryKey` | `CURRENT` (جاری), `CAPITAL` (عمرانی) |
| `FeedbackStatus` | `OPEN`, `ANSWERED`, `RESOLVED`, `REJECTED` |
| `FeedbackTargetKind` | `DOCUMENT`, `STAD_META`, `VENDOR`, `INVOICE`, `INVOICE_ITEM`, `PAYMENT`, `ARCHIVE`, `TAX_REPORT` |
| `RevisionTrigger` | `FINALIZE`, `REOPEN`, `ARCHIVE`, `CORRECTION` |
| `AttachmentKind` | `SCAN`, `OTHER`, `REPORT_OUTPUT` |
| `ScanStatus` | `SKIPPED`, `PENDING`, `CLEAN`, `INFECTED` |
| `ReportRunStatus` | `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `EXPIRED` |
| `TemplateStatus` | `DRAFT`, `PUBLISHED`, `ARCHIVED` |

مقادیر enum در دیتابیس **انگلیسی و پایدار** هستند؛ ترجمه فارسی آن‌ها در
`packages/shared/src/enums` به‌صورت نگاشت متمرکز نگهداری می‌شود (الزام «متن‌های نمایشی
پراکنده نباشند»).
