# فهرست مستندات

مستندات این پروژه به‌صورت «سند زنده» نگهداری می‌شوند: هر تغییر در رفتار نرم‌افزار باید
در همان Pull Request مستند مربوطه را نیز به‌روز کند.

## فاز صفر (تحلیل و معماری) — ایجادشده

| # | سند | توضیح |
|---|---|---|
| 00 | [requirements-summary](00-requirements-summary.md) | خلاصه نیازمندی‌ها، تصمیم‌های قطعی، دامنه خارج از کار |
| 01 | [architecture](01-architecture.md) | معماری سیستم، ماژول‌ها، مرزها، جریان درخواست |
| 02 | [repo-structure](02-repo-structure.md) | ساختار مخزن، workspaceها، وابستگی‌ها |
| 03 | [erd](03-erd.md) | ERD، موجودیت‌ها، constraintها، ایندکس‌ها |
| 04 | [data-dictionary](04-data-dictionary.md) | فرهنست داده: فیلدها، نوع، واحد، منبع |
| 05 | [invoice-types](05-invoice-types.md) | مدل انواع فاکتور و اتصال پویا به فصل‌ها |
| 06 | [roles-permissions](06-roles-permissions.md) | ماتریس نقش‌ها و مجوزها |
| 07 | [document-workflow](07-document-workflow.md) | گردش کار سند از ایجاد تا بایگانی |
| 08 | [financial-rules](08-financial-rules.md) | قواعد دقیق محاسبات مالی و گرد کردن |
| 09 | [report-engine](09-report-engine.md) | معماری طراح گزارش و موتور رندر |
| 10 | [security-plan](10-security-plan.md) | برنامه امنیت و محافظت از اطلاعات |
| 11 | [testing-plan](11-testing-plan.md) | برنامه آزمون و معیارهای کیفیت |
| 12 | [file-storage-policy](12-file-storage-policy.md) | سیاست مدیریت فایل و اسکن‌ها |
| 13 | [phasing](13-phasing.md) | فازبندی با معیار پذیرش قابل اثبات |
| 14 | [risks-and-open-questions](14-risks-and-open-questions.md) | ریسک‌ها و تصمیم‌های باز |
| 15 | [tax-report-reference](15-tax-report-reference.md) | تحلیل تصویر مرجع گزارش مالیات |
| 16 | [local-development](16-local-development.md) | راهنمای اجرای محلی و عیب‌یابی |
| — | [adr/](adr/) | تصمیم‌های معماری (Architecture Decision Records) |

## مستندات فازهای بعدی — هنوز ایجاد نشده‌اند

این مستندات در فاز مربوطه ایجاد می‌شوند و عمداً در فاز صفر تولید نشده‌اند تا مستند
بی‌پشتوانه و ناسازگار با کد واقعی ایجاد نشود:

| سند | فاز ایجاد |
|---|---|
| `16-api.md` + Swagger منتشرشده | فاز ۱ و به‌روزرسانی در هر فاز |
| `17-report-template-authoring.md` (راهنمای ساخت قالب) | فاز ۷ |
| `18-production-runbook.md` (راهنمای محیط Production) | فاز ۹ |
| `19-backup-and-recovery.md` (پشتیبان‌گیری و بازیابی + تست بازیابی) | فاز ۹ |
| `20-test-report.md` (گزارش واقعی اجرای تست‌ها) | پایان هر فاز |
| `21-release-checklist.md` (چک‌لیست تحویل) | فاز ۹ |
