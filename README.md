# سامانه مدیریت اسناد کارپردازی

سامانه سازمانی فارسی/راست‌چین برای مدیریت چرخه کامل اسناد مالی کارپردازی: ایجاد سند،
ثبت فاکتورهای چندساختاره، محاسبات مالی دقیق ریالی، گردش کار ثبت و بایگانی، بازخورد ناظر،
و تولید خروجی‌های چاپی قابل طراحی (گزارش مالیات و گزارش‌های آینده).

> **وضعیت فعلی: فاز صفر — تحلیل و معماری.**
> هنوز هیچ کدی پیاده‌سازی نشده است. این مخزن در حال حاضر فقط شامل مستندات تحلیل،
> معماری، مدل داده و برنامه فازبندی است. پیاده‌سازی پس از تأیید فاز صفر آغاز می‌شود.

## نقطه شروع مطالعه

| سند | موضوع |
|---|---|
| [docs/00-requirements-summary.md](docs/00-requirements-summary.md) | خلاصه نیازمندی‌ها و تصمیم‌های قطعی |
| [docs/01-architecture.md](docs/01-architecture.md) | معماری Frontend و Backend |
| [docs/02-repo-structure.md](docs/02-repo-structure.md) | ساختار پیشنهادی مخزن |
| [docs/03-erd.md](docs/03-erd.md) | مدل داده و ERD |
| [docs/08-financial-rules.md](docs/08-financial-rules.md) | قواعد محاسبات مالی |
| [docs/14-risks-and-open-questions.md](docs/14-risks-and-open-questions.md) | **ابهامات نیازمند تصمیم شما** |
| [docs/15-tax-report-reference.md](docs/15-tax-report-reference.md) | تحلیل تصویر مرجع گزارش مالیات |
| [docs/13-phasing.md](docs/13-phasing.md) | فازبندی و معیار پذیرش |
| [docs/adr/](docs/adr/) | تصمیم‌های معماری (ADR) |

فهرست کامل مستندات: [docs/README.md](docs/README.md)

## پیش‌نیازهای محیط (برای فازهای بعدی)

محیط فعلی بررسی شد: Node.js 24.12، npm 11.6، Docker 29.2، Git 2.40. PostgreSQL به‌صورت
محلی نصب نیست و از طریق Docker Compose تأمین خواهد شد.

## واحد پول

**تمام مبالغ سامانه بر حسب ریال و از نوع عدد صحیح هستند.** هیچ تبدیل خودکاری به تومان
انجام نمی‌شود. جزئیات در [docs/08-financial-rules.md](docs/08-financial-rules.md).
