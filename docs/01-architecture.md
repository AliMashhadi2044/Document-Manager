
# ۰۱ — معماری سیستم

## ۱. تصویر کلان

```
┌─────────────────────────────────────────────────────────────────┐
│  مرورگر — apps/web                                              │
│  React 19 + TypeScript strict + Vite                            │
│  shadcn/ui + Tailwind (RTL) · TanStack Query/Table              │
│  React Hook Form + Zod (همان schemaهای packages/shared)         │
│  محاسبه مالی «پیش‌نمایش» با packages/shared/money               │
└───────────────┬─────────────────────────────────────────────────┘
                │ HTTPS · کوکی نشست HttpOnly · هدر CSRF
                │ مبالغ به‌صورت رشته عددی (ADR-0003)
┌───────────────▼─────────────────────────────────────────────────┐
│  apps/api — NestJS (Modular Monolith)                           │
│                                                                 │
│  لایه Interface:  Controllers · DTO (Zod) · Swagger             │
│  لایه Application: Use-caseها · تراکنش · مجوز · audit           │
│  لایه Domain:     موجودیت‌ها · قواعد · ماشین وضعیت              │
│  لایه Infra:      Prisma · S3 · صف · رندر PDF                   │
│                                                                 │
│  ماژول‌ها (مرز صریح):                                           │
│   auth · users-roles · base-data · vendors · buyers             │
│   documents · invoices · payments · archive · feedback          │
│   financial (محاسبات) · reporting (موتور) · exports             │
│   audit · files · notifications · jobs                          │
└──┬────────────┬──────────────┬─────────────────┬────────────────┘
   │            │              │                 │
┌──▼──────┐ ┌───▼────────┐ ┌───▼──────────┐ ┌────▼─────────────┐
│Postgres │ │Object Store│ │ صف کارها     │ │ Chromium (PDF)   │
│  16     │ │ S3/MinIO   │ │ (pg-boss)    │ │ Playwright       │
└─────────┘ └────────────┘ └──────────────┘ └──────────────────┘
```

## ۲. چرا Modular Monolith

یک سازمان، یک پایگاه داده، نیاز شدید به **تراکنش‌های یکپارچه** (ثبت نهایی سند باید سند،
فاکتورها، اقلام، snapshotها، نسخه و audit log را اتمی ثبت کند). Microservices اینجا
تراکنش را به saga تبدیل می‌کند و برای هیچ مزیتی هزینه بزرگی می‌دهد.
جزئیات و معیار بازنگری: [ADR-0002](adr/ADR-0002-modular-monolith.md).

## ۳. قواعد مرزبندی ماژول‌ها

قواعدی که با ESLint boundary rules در CI اجبار می‌شوند:

1. هر ماژول یک `index.ts` عمومی دارد؛ ماژول دیگر فقط از آن import می‌کند، نه از فایل‌های درونی.
2. **منطق مالی فقط در `financial`** است. `invoices` و `reporting` آن را مصرف می‌کنند و
   فرمول را بازنویسی نمی‌کنند. (ریسک R1)
3. `reporting` به Prisma دسترسی مستقیم **ندارد**؛ داده را فقط از Data Dictionary می‌گیرد. (ریسک R5)
4. هیچ ماژولی مستقیم به `files` (storage) دسترسی ندارد جز از طریق سرویس عمومی آن که
   اعتبارسنجی و کنترل دسترسی را اعمال می‌کند.
5. `audit` از همه ماژول‌ها فراخوانی می‌شود ولی به هیچ ماژولی وابسته نیست.
6. UI هیچ‌گاه مرجع کنترل دسترسی نیست؛ فقط بازتاب مجوزهای سرور است.

## ۴. مسئولیت ماژول‌ها

| ماژول | مسئولیت | وابستگی مجاز |
|---|---|---|
| `auth` | ورود، نشست، خروج، محدودیت تلاش، رویداد امنیتی | users-roles, audit |
| `users-roles` | کاربر، نقش، مجوز، تخصیص | audit |
| `base-data` | سازمان، فصل، ناحیه، مدرسه، انشعاب، خودرو، سوخت، نوع درخواست، نوع کالا، امضاکنندگان، تنظیمات مالی | audit |
| `vendors` | دفترچه فروشنده، شباها، جست‌وجوی چندمعیاره، تشخیص تکراری | base-data, audit |
| `buyers` | مجموعه‌های خریدار | audit |
| `documents` | سند، فراداده ستاد، ماشین وضعیت، نسخه‌ها، ثبت نهایی، بازگشایی | invoices, financial, audit |
| `invoices` | فاکتور و انواع آن، اقلام، جزئیات اختصاصی، snapshotها | vendors, buyers, base-data, financial, audit |
| `payments` | روش پرداخت، شبا انتخابی، شناسه پرداخت/قبض | vendors, base-data, audit |
| `financial` | **تنها** مرجع محاسبه: ردیف، فاکتور، سند، تجمیع فروشنده | — (خالص، بدون I/O) |
| `archive` | شماره و تاریخ سند، گردش بایگانی، اتصال اسکن‌ها | documents, files, audit |
| `feedback` | بازخورد ناظر، پاسخ، وضعیت رسیدگی | documents, notifications, audit |
| `files` | آپلود، اعتبارسنجی، ذخیره، دانلود کنترل‌شده، پیش‌نمایش | audit |
| `reporting` | Data Dictionary، قالب، نسخه، موتور رندر، اجرای گزارش | financial, files, audit |
| `exports` | تولید Excel و PDF، صف، لینک دانلود موقت | reporting, files, jobs |
| `audit` | ثبت تغییرات فیلدی و رویدادهای حساس | — |
| `notifications` | اعلان داخلی | — |
| `jobs` | صف و worker (pg-boss روی همان Postgres) | — |

## ۵. جریان درخواست «ثبت نهایی سند» (نمونه بحرانی)

```
POST /api/documents/:id/finalize     (Idempotency-Key در هدر)
  │
  ├─ 1. CsrfGuard  → بررسی هدر CSRF
  ├─ 2. SessionGuard → بارگذاری کاربر از نشست سروری
  ├─ 3. PermissionGuard('document:finalize')
  ├─ 4. IdempotencyInterceptor → اگر همین کلید قبلاً اجرا شده، پاسخ قبلی را برگردان
  │
  └─ TRANSACTION (SERIALIZABLE یا READ COMMITTED + قفل ردیف)
       ├─ SELECT … FROM documents WHERE id=? FOR UPDATE   ← ضد race (R8)
       ├─ بررسی مجاز بودن انتقال وضعیت از ماشین وضعیت
       ├─ اعتبارسنجی کامل سند:
       │    ├─ فیلدهای الزامی سند
       │    ├─ هر فاکتور: schema مخصوص نوع خودش
       │    ├─ سازگاری نوع سند و تعداد فاکتور (ستاد ← حداکثر ۱)
       │    ├─ روش پرداخت معتبر و فیلدهای لازمش کامل
       │    └─ بازمحاسبه کامل مالی و تطبیق با مقادیر ذخیره‌شده
       │         (اختلاف ← خطای 422 با جزئیات ردیف، نه ثبت)
       ├─ UPDATE documents SET status='FINALIZED', finalized_at, finalized_by
       ├─ INSERT document_revisions (snapshot کامل JSON + schemaVersion)
       ├─ INSERT audit_logs (رویداد + مقادیر قبل/بعد)
       └─ COMMIT
  │
  └─ پاسخ: سند + پیشنهاد «مشاهده و چاپ خروجی مالیات» (در صورت فعال بودن برای این نوع سند)
```

نکته: اگر هر مرحله خطا دهد، تراکنش rollback می‌شود و سند **هرگز** در وضعیت نیمه‌ثبت‌شده
نمی‌ماند.

## ۶. معماری Frontend

```
apps/web/src/
  app/                 — bootstrap، router، providerها، مرز خطا
  shared/
    ui/                — کامپوننت‌های shadcn (پایه، بدون منطق دامنه)
    components/        — کامپوننت‌های ترکیبی سامانه (DataTable، FilterBuilder، …)
    hooks/  lib/  i18n/
  features/
    auth/  dashboard/  documents/  invoices/  vendors/  buyers/
    base-data/  archive/  review/  reports/  report-designer/  settings/
```

قواعد:

- هر feature دارای `api/` (فراخوانی و کلیدهای TanStack Query)، `components/`،
  `schemas/` (re-export از shared) و `routes/` است.
- **هیچ feature از درون feature دیگر import نمی‌کند**؛ اشتراک از طریق `shared/`.
- متن‌های نمایشی در `shared/i18n/fa/*.ts` متمرکزند، نه پراکنده در JSX. (الزام §۴ پرامپت)
- `PermissionGuard` فقط برای تجربه کاربری است؛ منبع حقیقت، سرور است.
- فرم‌ها: React Hook Form + `zodResolver` با **همان** schema اشتراکی سرور، تا پیام خطا و
  قاعده اعتبارسنجی در دو جا واگرا نشوند.
- وضعیت سرور با TanStack Query؛ وضعیت فرم با RHF. بدون Redux.

### RTL و تم

- `<html dir="rtl" lang="fa">`؛ Tailwind با logical properties (`ps-`/`pe-`/`ms-`/`me-`)
  و ممنوعیت lint روی `pl-`/`pr-`/`left-`/`right-` در کد دامنه.
- تم با CSS variables روی `:root` و `[data-theme]`؛ سه حالت روشن/تاریک/سیستم.
- رنگ اصلی سازمانی از فهرست مجاز، ذخیره در `user_preferences`.
- فونت: وزیرمتن (Vazirmatn) به‌صورت self-hosted با `font-display: swap`؛ اعداد نمایشی
  فارسی اما مقدار واقعی همیشه ASCII.

## ۷. قراردادهای API

- پیشوند `/api`، نسخه‌دهی `/api/v1` از ابتدا.
- اعتبارسنجی ورودی با Zod در یک `ZodValidationPipe` سراسری (نه فقط class-validator) تا
  schema با Frontend مشترک باشد.
- **مبالغ همیشه رشته عددی** (`"12500000"`). مستند در Swagger. ([ADR-0003](adr/ADR-0003-money-bigint-rial.md))
- تاریخ‌های واقعی: `date` خالص به‌صورت `YYYY-MM-DD` (بدون timezone)، زمان رویدادها به‌صورت
  `timestamptz` و ISO-8601 در UTC.
- خطای ساختاریافته:
  ```json
  { "statusCode": 422, "code": "FINANCIAL_MISMATCH", "message": "پیام فارسی قابل نمایش",
    "details": [{ "path": "invoices.0.items.2.taxAmount", "expected": "…", "actual": "…" }],
    "traceId": "…" }
  ```
  هرگز stack trace یا پیام دیتابیس به کاربر نمی‌رسد؛ `traceId` برای تطبیق با log سروری است.
- صفحه‌بندی: `?page&pageSize&sort&filter` با سقف `pageSize`؛ پاسخ شامل `total` و
  در صورت نیاز `aggregates` (جمع مبالغ نتایج فیلترشده).
- Swagger در محیط توسعه باز و در production پشت مجوز.

## ۸. مشاهده‌پذیری

- Logging ساختاریافته با `pino` + `traceId` در هر درخواست (AsyncLocalStorage).
- **حذف داده حساس از log**: redact برای `password`, `iban`, `token`, `cookie`,
  `nationalId`, `economicCode` به‌صورت allowlist معکوس در تنظیمات pino.
- `/health` (liveness) و `/health/ready` (اتصال DB و object storage).
- متریک‌های کلیدی: مدت درخواست، صف گزارش، مدت رندر PDF، خطاهای ۵xx.

## ۹. وابستگی‌های منتخب و دلیل

| وابستگی | چرا این، و نه جایگزین |
|---|---|
| Prisma | migration قابل بازبینی، تایپ قوی. `BigInt` را بومی به `bigint` نگاشت می‌کند. محدودیت‌ها (ایندکس جزئی، FK ترکیبی) با SQL خام در migration پوشش داده می‌شوند. |
| Zod | مشترک بین کلاینت و سرور؛ همین اشتراک جلوی واگرایی اعتبارسنجی را می‌گیرد. |
| TanStack Query/Table | صفحه‌بندی و فیلتر سمت سرور، ستون‌های قابل تنظیم، بدون نوشتن جدول از صفر. |
| `pg-boss` | صف روی **همان** Postgres؛ بدون افزودن Redis به زیرساخت سازمان. |
| Playwright | هم E2E و هم رندر PDF با Chromium واقعی — یک وابستگی، دو کاربرد. |
| `exceljs` | Excel با سلول عددی واقعی و فرمت، نه HTML با پسوند xlsx. |
| `date-fns-jalali` | تبدیل و اعتبارسنجی تاریخ شمسی در سرور. ([ADR-0008](adr/ADR-0008-jalali-dates.md)) |
| `argon2` | هش رمز عبور (Argon2id). |
| `file-type` | تشخیص نوع واقعی فایل از magic byte. |
| `fast-check` | property-based test برای محاسبات مالی. |

وابستگی‌هایی که عمداً **اضافه نمی‌شوند**: Redis، Nx/Turborepo، Redux، کتابخانه دوم UI،
کتابخانه دوم تبدیل تاریخ در سرور، ORM دوم.
