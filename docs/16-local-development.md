
# ۱۶ — راهنمای اجرای محلی

## ۱. پیش‌نیازها

| ابزار | نسخه آزمایش‌شده |
|---|---|
| Node.js | 24.12 |
| npm | 11.6 |
| Docker Desktop | 29.2 |
| Git | 2.40 |

PostgreSQL محلی لازم **نیست**؛ از Docker می‌آید.

## ۲. راه‌اندازی از صفر

```bash
npm install
cp .env.example .env            # مقادیر را پر کنید
cp .env.example apps/api/.env   # DATABASE_URL و SESSION_SECRET الزامی‌اند
npm run docker:up               # PostgreSQL
npm run build:shared            # پکیج مشترک باید قبل از بقیه ساخته شود
npm run -w @dm/api db:migrate   # اعمال migrationها
npm run -w @dm/api db:seed      # نقش‌ها، مجوزها، تنظیمات و کاربر اولیه
```

سپس در دو ترمینال:

```bash
npm run -w @dm/api dev     # سرویس روی http://localhost:3100
npm run -w @dm/web dev     # رابط روی http://localhost:5173
```

ورود اولیه: کاربر `admin`. رمز عبور از `SEED_ADMIN_PASSWORD` خوانده می‌شود؛ اگر تعیین
نشده باشد در محیط توسعه `Admin!2345` ساخته می‌شود و هشدار چاپ می‌گردد.
در production، نبودن این متغیر **خطا** است تا حساب با رمز قابل حدس ساخته نشود.

## ۳. سه نکته مربوط به این ماشین

این موارد در راه‌اندازی واقعی روی ماشین شما کشف شدند و در پیکربندی اعمال شده‌اند:

| موضوع | یافته | تصمیم |
|---|---|---|
| پورت PostgreSQL | روی این ماشین یک **PostgreSQL محلی** از قبل روی `5432` در حال اجراست | کانتینر روی **`5433`** منتشر می‌شود. اگر از `5432` استفاده می‌کردیم، برنامه بی‌صدا به دیتابیس اشتباه وصل می‌شد. |
| پورت API | ویندوز بازه `2924–3023` را رزرو کرده و `3000` قابل bind نیست (`EACCES`) | API روی **`3100`** گوش می‌دهد. |
| پورت رابط وب | `5173` ممکن است در اختیار پروژه Vite دیگری باشد | در صورت اشغال بودن، با `--port` پورت دیگری بدهید (مثلاً `5180`). |

برای دیدن بازه‌های رزروشده ویندوز:

```bash
netsh interface ipv4 show excludedportrange protocol=tcp
```

## ۴. object storage (MinIO)

**تا فاز ۵ لازم نیست.** سرویس آن پشت یک profile است تا راه‌اندازی روزمره را کند نکند:

```bash
docker compose -f infrastructure/docker-compose.dev.yml --profile storage up -d
```

> ⚠️ روی شبکه این محیط، کشیدن ایمیج `minio/minio` و `minio/mc` از Docker Hub ممکن نشد
> (`pull access denied`)، در حالی که `postgres:16-alpine` بدون مشکل کشیده شد. پیش از
> فاز ۵ یکی از این راه‌ها لازم است:
>
> 1. تنظیم registry mirror یا proxy روی Docker Desktop.
> 2. آوردن ایمیج از یک شبکه دیگر با `docker save` / `docker load`.
> 3. تعیین ایمیج جایگزین با متغیر `MINIO_IMAGE` در compose.
>
> bucket توسط خود سرویس API در زمان بالا آمدن ساخته می‌شود، پس به ایمیج `mc` نیازی نیست.

## ۵. دستورهای روزمره

| دستور | کار |
|---|---|
| `npm test` | اجرای همه تست‌های واحد |
| `npm run test:coverage` | گزارش پوشش |
| `npm run typecheck` | بررسی تایپ همه workspaceها |
| `npm run build:shared` | ساخت پکیج مشترک (CJS + ESM) |
| `npm run docker:up` / `docker:down` | بالا/پایین بردن سرویس‌ها |
| `npm run -w @dm/api db:migrate` | ساخت و اعمال migration |
| `npm run -w @dm/api db:reset` | بازسازی کامل دیتابیس (داده‌ها پاک می‌شوند) |

## ۶. چرا پکیج مشترک دو خروجی دارد

`@dm/shared` هم‌زمان توسط NestJS (CommonJS) و Vite (ESM) مصرف می‌شود. با خروجی تک‌قالبی،
Rollup نتوانست نام‌های صادرشده از زنجیره `export *` را به‌صورت استاتیک تشخیص دهد و build
رابط وب می‌شکست. بنابراین پکیج **هر دو قالب** را می‌سازد:

```
dist/cjs/  → NestJS (require)   + package.json با {"type":"commonjs"}
dist/esm/  → Vite    (import)   + package.json با {"type":"module"}
```

به همین دلیل importهای نسبی داخل `packages/shared` پسوند `.js` دارند؛ این برای خروجی
ESM استاندارد لازم است و در CJS هم درست کار می‌کند.

## ۷. عیب‌یابی

| نشانه | علت محتمل | راه‌حل |
|---|---|---|
| `P1000 Authentication failed` | اتصال به PostgreSQL محلی به‌جای کانتینر | از پورت `5433` در `DATABASE_URL` استفاده کنید |
| `listen EACCES :3000` | پورت در بازه رزروشده ویندوز | `API_PORT=3100` |
| صفحه Vite دیگری باز می‌شود | `5173` اشغال است | `--port 5180 --strictPort` |
| `"X" is not exported by shared/dist` | پکیج مشترک ساخته نشده یا قدیمی است | `npm run build:shared` |
| `تنظیمات محیطی نامعتبر است` | متغیر الزامی خالی است | پیام خطا نام دقیق متغیر را می‌گوید |
| ۴۰۳ با پیام CSRF | هدر `x-csrf-token` ارسال نشده | کلاینت آن را از کوکی `dm_csrf` می‌خواند؛ کوکی‌ها را پاک و دوباره وارد شوید |
