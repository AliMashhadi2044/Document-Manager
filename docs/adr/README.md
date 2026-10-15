
# تصمیم‌های معماری (ADR)

هر ADR یک تصمیم، دلیل آن، جایگزین‌های رد‌شده و **معیار بازنگری** را ثبت می‌کند.
ADR پس از پذیرش ویرایش نمی‌شود؛ تصمیم جدید ADR جدید می‌گیرد و ADR قدیم را
`Superseded by` می‌کند.

| # | عنوان | وضعیت |
|---|---|---|
| [0001](ADR-0001-monorepo-npm-workspaces.md) | Monorepo با npm workspaces | پذیرفته |
| [0002](ADR-0002-modular-monolith.md) | Modular Monolith به‌جای Microservices | پذیرفته |
| [0003](ADR-0003-money-bigint-rial.md) | مبالغ به‌صورت BIGINT ریال و رشته در API | پذیرفته |
| [0004](ADR-0004-session-cookie-auth.md) | نشست سروری با کوکی، نه JWT در مرورگر | پذیرفته |
| [0005](ADR-0005-snapshot-tables.md) | snapshot در جدول ساختارمند، نه JSON | پذیرفته |
| [0006](ADR-0006-stad-single-invoice.md) | محدودیت فاکتور ستاد با ایندکس یکتای جزئی | پذیرفته |
| [0007](ADR-0007-safe-expression-ast.md) | AST امن برای شرط و محاسبه گزارش | پذیرفته |
| [0008](ADR-0008-jalali-dates.md) | کتابخانه‌های تاریخ شمسی | پذیرفته |
| [0009](ADR-0009-document-revisions.md) | نسخه‌بندی سند برای بازگشایی و اصلاح | پذیرفته |
| [0010](ADR-0010-vitest-single-runner.md) | Vitest به‌عنوان تنها test runner | پذیرفته |
| [0011](ADR-0011-s3-object-storage.md) | object storage سازگار با S3 | پذیرفته |
| [0012](ADR-0012-rounding-policy-snapshot.md) | snapshot سیاست گرد کردن روی سند | پذیرفته |
