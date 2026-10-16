
# ۰۲ — ساختار پیشنهادی مخزن

مخزن در آغاز این فاز **خالی** بود (هیچ فایل، هیچ Git). بنابراین ساختار از صفر پیشنهاد
می‌شود و هیچ کد موجودی بازنویسی نمی‌شود.

## ۱. ساختار

```
Document-Manager/
├─ package.json                  ← ریشه workspace (npm workspaces)، فقط scriptها و devDeps
├─ tsconfig.base.json
├─ .editorconfig  .gitignore  .gitattributes
├─ .env.example                  ← نمونه، بدون هیچ secret واقعی
├─ eslint.config.js              ← flat config مشترک + قواعد مرز ماژول
│
├─ apps/
│  ├─ api/                       ← NestJS
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  ├─ migrations/          ← migrationهای قابل بازبینی (شامل SQL خام)
│  │  │  └─ seed/
│  │  │     ├─ reference.ts      ← داده مرجع لازم برای کارکرد (نقش‌ها، مجوزها، بانک‌ها)
│  │  │     └─ demo.ts           ← داده آزمایشی، فقط محیط توسعه (جدا از migration)
│  │  ├─ src/
│  │  │  ├─ main.ts  app.module.ts
│  │  │  ├─ common/              ← guardها، pipeها، interceptorها، فیلتر خطا، bigint serializer
│  │  │  └─ modules/<module>/    ← هر ماژول با index.ts عمومی
│  │  └─ test/                   ← تست یکپارچه (Testcontainers)
│  │
│  └─ web/                       ← React + Vite
│     ├─ index.html  vite.config.ts  postcss.config.js
│     ├─ src/{app,shared,features}
│     └─ e2e/                    ← Playwright
│
├─ packages/
│  ├─ shared/                    ← هسته مشترک کلاینت و سرور (بدون وابستگی به Nest یا React)
│  │  └─ src/
│  │     ├─ money/               ← ریاضی ریالی bigint + گرد کردن + سریالایز
│  │     ├─ financial/           ← قواعد ردیف/فاکتور/سند/تجمیع فروشنده
│  │     ├─ jalali/              ← تبدیل، اعتبارسنجی، روزهای ماه، سال مالی
│  │     ├─ iban/                ← نرمال‌سازی، MOD-97، تشخیص بانک
│  │     ├─ schemas/             ← Zod schemaها (DTO مشترک)
│  │     ├─ enums/               ← وضعیت‌ها، انواع فاکتور، مجوزها
│  │     └─ format/              ← قالب نمایش عدد/تاریخ فارسی
│  │
│  ├─ report-engine/             ← مستقل از Nest و React
│  │  └─ src/
│  │     ├─ template-schema/     ← Zod schema قالب + نسخه‌بندی
│  │     ├─ expression/          ← AST امن: parse، validate، evaluate
│  │     ├─ data-dictionary/     ← تعریف منابع داده و مجوز هرکدام (بدون I/O)
│  │     ├─ layout/              ← قالب + داده ← سند چیدمان میانی
│  │     └─ renderers/           ← html (چاپی) · excel
│  │
│  └─ tsconfig/                  ← tsconfigهای پایه مشترک
│
├─ docs/                         ← مستندات (این پوشه)
│  ├─ adr/
│  └─ diagrams/
│
└─ infrastructure/
   ├─ docker-compose.dev.yml     ← Postgres 16 + MinIO
   ├─ docker-compose.prod.yml
   ├─ api.Dockerfile             ← شامل Chromium و فونت فارسی برای PDF
   ├─ web.Dockerfile
   └─ fonts/                     ← Vazirmatn برای رندر سروری
```

## ۲. چرا این مرزها

- **`packages/shared`** دلیل وجودی‌اش کاهش ریسک R1 است: تنها راه جلوگیری از واگرایی
  محاسبه مالی بین مرورگر و سرور، یک پیاده‌سازی و یک مجموعه تست است. این پکیج عمداً به
  Nest و React **وابسته نیست** تا هر دو طرف بتوانند مصرفش کنند.
- **`packages/report-engine`** از apps/api جدا است چون موتور رندر باید بدون HTTP و بدون
  دیتابیس قابل تست باشد: ورودی آن «قالب معتبر + داده مجاز» است، نه اتصال به Prisma.
  همین جداسازی، ریسک R5 (نشت داده از طریق قالب) را ساختاری حل می‌کند.
- **`apps/api/prisma/seed`** به دو فایل تقسیم شده چون پرامپت صریحاً داده آزمایشی را از
  داده واقعی و migration جدا می‌خواهد. `reference.ts` در production هم اجرا می‌شود،
  `demo.ts` هرگز.

## ۳. ابزار workspace

**npm workspaces** — بدون pnpm، Nx یا Turborepo.
دلیل: npm 11 روی ماشین نصب است، تعداد پکیج‌ها کم است (۲ app + ۳ package)، و افزودن
ابزار build graph برای این اندازه هزینه نگهداری بی‌دلیل دارد.
جزئیات و معیار بازنگری: [ADR-0001](adr/ADR-0001-monorepo-npm-workspaces.md).

scriptهای ریشه:

| script | کار |
|---|---|
| `dev` | بالا آوردن Docker، migrate، اجرای همزمان api و web |
| `build` | ترتیب: shared ← report-engine ← api و web |
| `test` | Vitest در تمام workspaceها |
| `test:int` | تست یکپارچه با Testcontainers |
| `test:e2e` | Playwright |
| `lint` / `typecheck` | ESLint و `tsc --noEmit` |
| `db:migrate` / `db:seed` / `db:reset` | عملیات دیتابیس |

## ۴. TypeScript

`strict: true` به‌همراه `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`.
`any` با قاعده ESLint ممنوع؛ استثنا فقط با `// eslint-disable` و توضیح دلیل.

## ۵. تنظیمات محیطی و secret

- `.env.example` شامل **نام** همه متغیرها با مقدار خالی یا placeholder واضح.
- `.env` در `.gitignore`.
- اعتبارسنجی متغیرهای محیطی در bootstrap با Zod؛ برنامه با تنظیم ناقص **بالا نمی‌آید**
  (fail fast) به‌جای اینکه با مقدار پیش‌فرض ناامن اجرا شود.
- هیچ secret در کد Frontend نیست؛ هر مقداری که به مرورگر می‌رسد عمومی فرض می‌شود.

## ۶. هدف استقرار (تأییدشده — Q12)

| موضوع | تصمیم |
|---|---|
| مبنای استقرار | **Docker** در هر دو محیط توسعه و production |
| سیستم‌عامل سرور | **لینوکس** (پیشنهاد کارفرما؛ سرور انعطاف‌پذیر است) |
| پایگاه داده | PostgreSQL 16 در Docker |
| object storage | **MinIO در Docker** — سازمان سرویس S3 موجود ندارد |
| سخت‌افزار | بدون محدودیت اعلام‌شده |
| الزام کیفی | **بهینگی برنامه الزام صریح کارفرماست** |

ترکیب سرویس‌ها در production: `api` (شامل Chromium و فونت فارسی برای PDF) ·
`web` (استاتیک پشت reverse proxy) · `postgres` · `minio` · worker صف در همان ایمیج `api`.

چون پایه لینوکس است، ایمیج‌ها بر مبنای Debian slim ساخته می‌شوند (نه Alpine)، چون
Chromium و فونت‌رندرینگ فارسی روی glibc پایدارتر از musl است — این انتخاب مستقیم ریسک
R3 (فونت و RTL در PDF) را کاهش می‌دهد.

### الزام بهینگی

«اپ بسیار بهینه باشد» به معیار قابل اندازه‌گیری ترجمه شده است، نه یک هدف مبهم:

- فیلتر، مرتب‌سازی و صفحه‌بندی **همیشه** سمت سرور؛ هیچ صفحه‌ای کل جدول را به مرورگر نمی‌آورد.
- بدون N+1 — **شمارش کوئری** در تست یکپارچه اثبات می‌شود، نه بازبینی چشمی.
- `EXPLAIN (ANALYZE, BUFFERS)` برای کوئری‌های اصلی **ثبت** می‌شود.
- گزارش حجیم و PDF در صف پس‌زمینه با سقف همزمانی و timeout.
- بسته Frontend با code splitting بر اساس مسیر؛ بودجه اندازه بسته در CI بررسی می‌شود.
- اعداد هدف و روش اندازه‌گیری: [11-testing-plan.md](11-testing-plan.md) §۶ و معیار پذیرش فاز ۸.

## ۷. CI (فاز ۱)

مرحله‌های اجباری روی هر Pull Request: `typecheck` → `lint` → `test` →
`test:int` → `build` → `test:e2e` (روی main و PRهای برچسب‌خورده) → `npm audit`.
بدون سبز شدن این مراحل، merge انجام نمی‌شود.
