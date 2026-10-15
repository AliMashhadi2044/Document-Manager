
# ADR-0010 — Vitest به‌عنوان تنها test runner

**وضعیت:** پذیرفته · **تاریخ:** فاز ۰

## زمینه

مخزن سه نوع کد دارد: پکیج‌های خالص TypeScript (`shared`, `report-engine`)، سرور NestJS
(با decorator و metadata)، و رابط React. انتخاب پیش‌فرض NestJS، Jest است و پیش‌فرض Vite،
Vitest. استفاده از هر دو یعنی دو پیکربندی، دو mock API، دو گزارش پوشش و دو منبع خطا.

## تصمیم

**Vitest** در کل مخزن. برای `apps/api` از `unplugin-swc` استفاده می‌شود تا
decoratorها و `emitDecoratorMetadata` که NestJS به آن‌ها نیاز دارد درست کامپایل شوند.
`@nestjs/testing` همان‌طور کار می‌کند.

## دلایل

- **یک پیکربندی، یک API.** الگوهای تست، helperها و matcherها بین پکیج‌ها مشترک می‌شوند.
- `packages/shared` باید **هم** در محیط Node (سرور) و **هم** مرورگر (کلاینت) تست شود؛
  Vitest با چند `environment` در یک workspace این را ساده می‌کند.
- سرعت: اجرای موازی و تبدیل مبتنی بر esbuild/swc، به‌ویژه برای `packages/shared` که
  تست‌های مالی زیادی دارد.
- `vitest --coverage` یک گزارش یکپارچه برای کل مخزن می‌دهد.

## جایگزین‌های رد‌شده

| جایگزین | دلیل رد |
|---|---|
| Jest برای api + Vitest برای web | دو پیکربندی، دو mock API، گزارش پوشش تکه‌تکه |
| Jest برای همه | برای Vite و ESM در بخش web پیکربندی پرزحمتی لازم است |
| Node test runner بومی | اکوسیستم mock و پوشش ضعیف‌تر؛ ابزار mock کامپوننت React ندارد |

## پیامدها

- `unplugin-swc` یک وابستگی توسعه اضافه است؛ رایج و پایدار در اکوسیستم NestJS+Vitest.
- اگر پلاگینی از Jest در NestJS لازم شد، باید معادل Vitest آن پیدا شود.
- Playwright جداگانه برای E2E می‌ماند — کار متفاوتی می‌کند و جایگزین نمی‌شود.
- Testcontainers برای تست یکپارچه با Vitest اجرا می‌شود؛ timeout پیش‌فرض برای بالا
  آمدن container افزایش می‌یابد.

## معیار بازنگری

اگر decoratorهای NestJS با swc در آینده مشکل پیدا کنند یا یک ابزار حیاتی فقط با Jest
کار کند، جدا کردن `apps/api` به Jest بازبینی می‌شود.
