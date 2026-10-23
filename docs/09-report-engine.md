
# ۰۹ — معماری طراح گزارش و موتور رندر

این زیرسیستم از ابتدا **مستقل** طراحی می‌شود. گزارش مالیات نخستین قالب آن است، نه یک
صفحه ویژه. هدف: افزودن خروجی جدید **بدون بازنویسی هسته** و **بدون تغییر کد**.

> **وضعیت پیاده‌سازی (پایان فاز ۶):** لایه‌های ۲ (schema قالب)، ۳ (حل داده) و ۴ (موتور
> رندر) ساخته و آزمون شده‌اند؛ لایه ۱ (طراح بصری) کار فاز ۷ است. خروجی‌های HTML چاپی،
> Excel و PDF کار می‌کنند. آنچه هنوز ساخته نشده: صف پس‌زمینه و ذخیره خروجی در object
> storage (خروجی هم‌زمان تولید و مستقیم فرستاده می‌شود)، و embed فونت در ایمیج Docker.
> جزئیات و شواهد در [۱۳ — فازبندی](13-phasing.md#فاز-۶--گزارش-مالیات-).

## ۱. چهار لایه مستقل

```
┌──────────────────────────────────────────────────────────┐
│ ۱. طراح (apps/web/features/report-designer)              │
│    بوم، Drag & Drop، پنل تنظیمات، پیش‌نمایش              │
│    خروجی‌اش فقط یک چیز است: یک سند JSON قالب             │
└───────────────────────┬──────────────────────────────────┘
                        │ Template JSON (معتبر با Zod)
┌───────────────────────▼──────────────────────────────────┐
│ ۲. Schema قالب (packages/report-engine/template-schema)  │
│    تعریف تایپ‌شده ساختار صفحه، عناصر، جدول، شرط، محاسبه  │
│    + نسخه‌بندی schema و مهاجرت نسخه‌های قدیمی            │
└───────────────────────┬──────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────┐
│ ۳. حل داده (apps/api/modules/reporting)                  │
│    Data Dictionary → resolver با هویت و مجوز کاربر       │
│    خروجی: Dataset مجاز و بسته (plain data، بدون Prisma)  │
└───────────────────────┬──────────────────────────────────┘
                        │ Template + Dataset + PrintSettings
┌───────────────────────▼──────────────────────────────────┐
│ ۴. موتور رندر (packages/report-engine)                   │
│    ارزیابی شرط و محاسبه (AST امن) → سند چیدمان میانی     │
│    → HTML چاپی · Excel ·  (PDF از HTML با Chromium)      │
└──────────────────────────────────────────────────────────┘
```

چرا این تفکیک حیاتی است: لایه ۴ **هیچ دسترسی به دیتابیس ندارد**. ورودی‌اش داده‌ای است که
لایه ۳ با مجوز کاربر **اجراکننده** تولید کرده. در نتیجه هیچ قالبی — هر چقدر دست‌کاری‌شده —
نمی‌تواند به داده‌ای برسد که کاربر حق دیدنش را ندارد (ریسک R5).

## ۲. Schema قالب (نسخه ۱)

```ts
export const TemplateV1 = z.object({
  schemaVersion: z.literal(1),
  reportTypeKey: z.string(),              // به report_types گره خورده
  page: z.object({
    size: z.enum(['A4', 'A5', 'A3', 'LETTER']),
    orientation: z.enum(['portrait', 'landscape']),
    margins: z.object({ top: Mm, bottom: Mm, inlineStart: Mm, inlineEnd: Mm }),
    direction: z.literal('rtl'),
  }),
  header: z.object({ height: Mm, blocks: z.array(BlockV1), repeatOnEveryPage: z.boolean() }),
  footer: z.object({ height: Mm, blocks: z.array(BlockV1), repeatOnEveryPage: z.boolean() }),
  body:   z.array(BlockV1),
  styles: StyleTokens,                    // فونت، اندازه، رنگ، ضخامت خط
});

export const BlockV1 = z.discriminatedUnion('type', [
  TextBlock,        // متن ثابت یا الگوی حاوی متغیر
  VariableBlock,    // یک متغیر از Data Dictionary با قالب نمایش
  TableBlock,       // جدول با منبع داده، ستون‌ها، گروه‌بندی، ردیف جمع
  ImageBlock,       // لوگو یا تصویر از اطلاعات پایه
  SignatureBlock,   // کادر امضا با عنوان و نام از signatories
  DividerBlock, SpacerBlock, PageNumberBlock, GeneratedAtBlock,
  SectionBlock,     // ظرف با visibleWhen
]);
```

هر بلوک دو فیلد مشترک اختیاری دارد:

```ts
visibleWhen?: Condition    // AST شرط
style?: BlockStyleOverride
```

### جدول

```ts
TableBlock = {
  type: 'table',
  dataSource: DataSourceRef,              // باید در Data Dictionary باشد
  columns: Array<{
    key: string,
    titleFa: string,
    width: { unit: 'mm' | 'percent' | 'auto', value?: number },
    align: 'start' | 'center' | 'end',
    value: Expression,                     // AST محاسبه یا ارجاع متغیر
    format: FormatSpec,                    // currency | integer | decimal | jalaliDate | text
    multiline?: MultilineSpec,             // چند خط در یک سلول (مثل هویت فروشنده)
    visibleWhen?: Condition,
  }>,
  groupBy?: Expression[],
  sortBy?: Array<{ expr: Expression, dir: 'asc' | 'desc' }>,
  totalsRow?: { enabled: boolean, cells: Record<string, Aggregate> },
  pagination: {
    repeatHeaderOnNewPage: boolean,
    avoidRowBreak: boolean,
    minRowsBeforeBreak: number,
  },
}
```

## ۳. Data Dictionary

منبع حقیقت، **کد** است (تا تایپ‌شده و قابل بازبینی باشد) و به UI طراح به‌صورت API
صادر می‌شود. هیچ مسیر داده‌ای خارج از این فهرست قابل ارجاع نیست.

```ts
export interface DataSourceDefinition {
  key: string;                    // 'document.invoices'
  titleFa: string;
  cardinality: 'single' | 'list';
  requiredPermissions: Permission[];
  fields: Record<string, FieldDefinition>;
  resolve: (ctx: ReportContext) => Promise<unknown>;  // فقط در apps/api
}

export interface FieldDefinition {
  key: string;                    // 'vendor.economicCode'
  titleFa: string;
  type: 'money' | 'qty' | 'integer' | 'text' | 'date' | 'jalaliDate' | 'boolean' | 'enum';
  requiredPermissions?: Permission[];   // مجوز در سطح فیلد
  usableInCondition: boolean;
  usableInCalculation: boolean;
  defaultFormat: FormatSpec;
}
```

### منابع نسخه اول

| کلید | کاردینالیتی | مجوز |
|---|---|---|
| `organization` | single | `base_data:read` |
| `signatories` | list | `base_data:read` |
| `document` | single | `document:read` |
| `document.stad` | single | `document:read` |
| `document.buyer` | single | `document:read` |
| `document.totals` | single | `document:read` |
| `document.invoices` | list | `document:read` |
| `document.invoices.items` | list | `document:read` |
| `document.invoices.fuelEntries` | list | `document:read` |
| `document.invoices.payment` | list | `document:read` |
| `document.vendorAggregates` | list | `document:read` + `report:run` |
| `document.archive` | single | `archive:read` |
| `document.feedbacks` | list | `feedback:read` |
| `document.revision` | single | `document:read_history` |

`document.vendorAggregates` همان تجمیع گزارش مالیات است که **در لایه `financial`** محاسبه
می‌شود، نه در قالب. قالب فقط آن را نمایش می‌دهد. یعنی قاعده «شماره صورتحواب خالی برای چند
فاکتور» و «تاریخ اولین فاکتور» کد تست‌شده است، نه تنظیم قالب.

> **پیاده‌سازی (فاز ۶ و ۷):** نسخه ساخته‌شده چهار منبع دارد — `organization`،
> `document`، `document.vendorAggregates` و `document.invoices` — و بقیه این جدول
> هنوز اضافه نشده‌اند. دو تصحیح نسبت به طرح بالا:
>
> ۱. **مجوز سطح فیلد واقعاً اعمال می‌شود.** `requiredPermissions` روی فیلد در فاز ۶
> اعلام شده بود ولی هیچ‌جا خوانده نمی‌شد. از فاز ۷ خوانده می‌شود و مبالغ **تک‌تک
> فاکتورها** در `document.invoices` مجوز `invoice:read_calc_details` می‌خواهند؛ گزارش
> تجمیعی فروشنده‌ها این مجوز را نمی‌خواهد، چون بایگانی باید بتواند گزارش مالیات را
> چاپ کند.
>
> ۲. **مسیر `row.*` پیش از بررسی مجوز با کلید مجموعه‌اش کامل می‌شود.** ستونی از جدولی
> با منبع `document.invoices` که `row.taxAmount` را می‌خواند، به
> `document.invoices.taxAmount` تبدیل می‌شود. بدون این، نمی‌شد فهمید `row.taxAmount`
> به کدام مجموعه است و مجوز سطح فیلد هیچ‌وقت سنجیده نمی‌شد.

### پایداری نام متغیر

`key` فنی هر فیلد **تغییرناپذیر** است؛ `titleFa` آزادانه قابل تغییر است و قالب‌های
ذخیره‌شده را خراب نمی‌کند. تغییر یا حذف یک `key` نیازمند مهاجرت `schemaVersion` و یک
نقشه تبدیل است — همان الزام §۲۳.۵ پرامپت.

## ۳.۴ «نوع کالا» از کجا می‌آید

ستون «نوع کالا» در گزارش مالیات سه منبع دارد، به همین ترتیب:

1. آنچه کاربر برای همین **سند و فروشنده** ثبت کرده — یکی از انواع تعریف‌شده یا متنی
   که خودش نوشته.
2. اگر ثبت نکرده: **شرح اولین فاکتور** همان فروشنده در همین سند (به ترتیب قطعی
   گزارش: تاریخ صعودی، سپس شناسه).
3. وگرنه خالی.

پس این ستون بدون هیچ کاری هم معمولاً درست است. کاربر شرح را موقع ثبت فاکتور نوشته؛
دوباره پرسیدنش کار اضافه بود.

**«نوع کالا» دیگر به فهرست بسته نیست.** `document_vendor_product_types` حالا یا
`product_type_id` دارد یا `custom_title` — دقیقاً یکی (قید CHECK). بستنش به فهرست،
کاربر را وادار می‌کرد برای هر عبارت تازه یک «نوع کالا» بسازد.

حافظهٔ پیشنهاد (`vendor_product_type_suggestions`) فقط با انتخاب **از فهرست** بالا
می‌رود: آن فهرست قرار است انواع تعریف‌شده را مرتب کند، نه هر عبارتی که یک بار نوشته
شده. تاریخچهٔ متن‌ها جای دیگری است — شرح خودِ فاکتورهای همان فروشنده، که دیالوگ با
سند و فصل و تاریخ و مبلغشان نشان می‌دهد. فاکتور بی‌شرح در آن فهرست نمی‌آید.

## ۳.۵ مقدار enum، با برچسب فارسی

هر متغیری که مقدارش یک enum دیتابیس است — نوع سند، وضعیت، نوع فاکتور، نوع شخص — در
خروجی با **برچسب فارسی‌اش** می‌نشیند، نه با کلید. `STAD` و `FINALIZED` نامی نیستند
که کسی بیرون از سامانه بخواند، و فایل Excel دقیقاً جایی می‌رود که کسی کلیدهای
دیتابیس را نمی‌شناسد.

دو مسیر، یک قاعده:

| مسیر | کجا نگاشت می‌شود |
|---|---|
| گزارش‌گیری عمومی (جدول و Excel) | `table.exporter.ts`، از روی `enumValues` همان فیلد |
| قالب‌های طراح گزارش (PDF و Excel) | `dataset.service.ts`، از روی برچسب‌های `@dm/shared` |

پیش از این، نگاشت فقط در **جدولِ روی صفحه** و سمت کلاینت انجام می‌شد؛ پس همان ستونی
که در سامانه «ستاد» بود، در فایل `STAD` می‌شد.

مقداری که در فهرست نباشد **خام** نوشته می‌شود. فهرست enum با مهاجرت دیتابیس جلو
می‌رود و اگر یکی از آن دو عقب بماند، نوشتن خالی به‌جای مقدار، خطا را پنهان می‌کند.

## ۴. شرط و محاسبه — AST امن

**ممنوعیت مطلق:** `eval`، `new Function`، قالب رشته‌ای اجراشدنی، SQL دلخواه، دسترسی
مستقیم به دیتابیس یا شبکه از داخل قالب. ([ADR-0007](adr/ADR-0007-safe-expression-ast.md))

```ts
export type Expression =
  | { k: 'const'; type: 'money'|'number'|'text'|'boolean'|'date'; v: string }
  | { k: 'var';   path: string }                       // باید در Data Dictionary باشد
  | { k: 'agg';   fn: 'sum'|'count'|'min'|'max'|'avg'; over: string; of?: Expression }
  | { k: 'arith'; op: 'add'|'sub'|'mul'|'divRound';    args: [Expression, Expression] }
  | { k: 'concat'; args: Expression[]; sep?: string }
  | { k: 'if';    cond: Condition; then: Expression; else: Expression }
  | { k: 'fmt';   of: Expression; format: FormatSpec };

export type Condition =
  | { k: 'cmp'; op: 'eq'|'neq'|'gt'|'gte'|'lt'|'lte'; args: [Expression, Expression] }
  | { k: 'in';  of: Expression; values: string[] }
  | { k: 'empty'; of: Expression }
  | { k: 'and'|'or'; args: Condition[] }
  | { k: 'not'; of: Condition };
```

محدودیت‌های اجباری ارزیاب:

| محدودیت | مقدار |
|---|---|
| حداکثر عمق درخت | ۲۰ ✅ |
| حداکثر تعداد گره در یک قالب | ۵٬۰۰۰ |
| حداکثر ردیف در یک جدول رندر | ۵۰٬۰۰۰ (بیشتر ← خروجی پس‌زمینه با صفحه‌بندی) |
| timeout ارزیابی | ۵ ثانیه |
| حلقه و بازگشت | وجود ندارد — AST درخت است، نه گراف |

اعتبارسنجی **قبل از ذخیره** و **قبل از اجرا**: هر `var.path` باید در Data Dictionary باشد،
نوع عملگرها باید با نوع داده بخواند (`mul` روی `text` خطا است)، و `divRound` از **همان**
`divRoundHalfUp` پروژه استفاده می‌کند تا محاسبه گزارش با محاسبه سند یکی بماند.

### نمونه شرط‌های واقعی از پرامپت

| نیاز | AST |
|---|---|
| «اگر نوع سند ستاد است، بخش ستاد نمایش داده شود» | `{k:'cmp',op:'eq',args:[{k:'var',path:'document.type'},{k:'const',type:'text',v:'STAD'}]}` |
| «اگر فروشنده حقوقی است، نام نماینده نمایش داده شود» | `and( eq(vendor.personType,'LEGAL'), not(empty(vendor.representativeName)) )` |
| «اگر مالیات صفر است، ستون نمایش داده نشود» | `{k:'cmp',op:'gt',args:[{k:'var',path:'row.tax'},{k:'const',type:'money',v:'0'}]}` |
| «اگر فاکتور بیش از یک ردیف دارد، جدول جزئیات» | `gt( agg(count, 'invoice.items'), const(1) )` |

## ۵. نسخه‌بندی قالب

```
report_definitions (قالب)
   └── report_versions (نسخه‌های تغییرناپذیر)
          version_no: 1 (PUBLISHED) ← خروجی‌های تاریخی به این بسته‌اند
          version_no: 2 (PUBLISHED)
          version_no: 3 (DRAFT)     ← در حال ویرایش
```

قواعد:

- نسخه `PUBLISHED` **هرگز** ویرایش نمی‌شود. ویرایش، نسخه `DRAFT` جدید می‌سازد.
- `report_definitions.current_version_id` به آخرین نسخه منتشرشده اشاره می‌کند.
- هر `report_runs` هم `version_id` و هم `document_revision_id` را ثبت می‌کند، پس
  **بازتولید بیت‌به‌بیت** خروجی تاریخی ممکن است.
- انتشار نسخه مجوز جدا دارد (`report_template:publish`).
- قالب‌های سیستمی (گزارش مالیات) `is_system` دارند: قابل کپی و ویرایش، ولی نسخه اصلی
  به‌عنوان مرجع بازگشت حفظ می‌شود.

> **تصحیح فاز ۷:** «کدام قالبِ منتشرشده اجرا می‌شود» باید یک **انتخاب صریح** باشد.
> نسخه اول با `findFirst` و ترتیب `created_at` کار می‌کرد و نتیجه‌اش این بود که کاربری
> که از قالب سیستمی کپی می‌گرفت، ویرایش و منتشرش می‌کرد، همچنان خروجی قالب قدیمی را
> می‌گرفت و هیچ پیامی هم نمی‌دید. ستون `report_types.active_definition_id` اضافه شد
> (با یک FK ترکیبی خام که تضمین می‌کند قالب فعال از همان نوع گزارش است) و فعال‌سازی یک
> اقدام جدا با مجوز `report_template:publish` و ثبت حسابرسی شد. انتشار، قالب فعال را
> عوض نمی‌کند — مگر وقتی هیچ قالب فعالی وجود ندارد، که آن‌وقت نگه داشتن «هیچ» فقط
> گزارش را از کار می‌انداخت.
>
> همچنین `document_revision_id` در `report_runs` ثبت **نمی‌شود** و بازپخش نسخه سند
> پیاده نشده است: بازتولید خروجی تاریخی «همان قالب» را تضمین می‌کند، نه «همان داده».
> ادعای «بازتولید بیت‌به‌بیت» بالا هنوز محقق نشده است.
>
> و بایگانی قالب: قالب از رده‌خارج `ARCHIVED` می‌شود و از فهرست پیش‌فرض بیرون می‌رود،
> ولی **پاک نمی‌شود** — `report_runs` به نسخه‌هایش ارجاع دارد و تاریخچه خروجی‌ها باید
> بماند. قالب سیستمی و قالب فعال بایگانی نمی‌شوند.

## ۶. چاپ و صفحه‌بندی

خروجی HTML با CSS چاپی واقعی:

```css
@page { size: A4 portrait; margin: 15mm 12mm; }
thead { display: table-header-group; }        /* تکرار سرستون در هر صفحه */
tfoot { display: table-footer-group; }
tr    { break-inside: avoid; }
.section, .signature-block { break-inside: avoid; }
.page-break { break-after: page; }
@media print { .no-print { display: none; } }
```

الزامات تست‌شده (فاز ۶):

- `dir="rtl"` روی ریشه و جدول‌ها؛ تراز ستون‌های عددی با logical properties.
- فونت وزیرمتن **embed‌شده در ایمیج Docker** — نه وابسته به فونت سیستم (ریسک R3).
- اعداد نمایشی فارسی، با `font-variant-numeric` سازگار و بدون شکستن تراز ستون.
- ستون‌های مهم بریده نمی‌شوند: در فاز ۶ تست عرض ستون‌ها روی A4 افقی و عمودی اجرا می‌شود.
- حالت چاپ سیاه‌وسفید: پالت جداگانه برای چاپ (بدون رنگ پس‌زمینه کم‌کنتراست).
- فضای امضاها با ارتفاع ثابت و `break-inside: avoid` تا امضا از صفحه جدا نیفتد.

## ۷. PDF

رندر HTML با **Chromium واقعی** (Playwright) در worker صف:

| کنترل | مقدار |
|---|---|
| همزمانی | حداکثر ۲ رندر همزمان (قابل تنظیم) |
| timeout | ۶۰ ثانیه برای هر رندر |
| حافظه | محدودیت در سطح container |
| شبکه | **قطع**؛ صفحه هیچ درخواست خارجی نمی‌دهد (فونت و تصویر محلی) |
| محتوای فعال | JavaScript در صفحه رندر غیرفعال است |
| ورودی | HTML تولیدشده توسط موتور، با escape کامل — هیچ HTML خام از داده کاربر |

**پیاده‌سازی فاز ۶:** `PdfRenderer` با `playwright-core` و Chromium headless. مرورگر
یک‌بار بالا می‌آید و بین درخواست‌ها می‌ماند (راه‌اندازی چند ثانیه طول می‌کشد)؛ هر
درخواست یک context جدا با `offline: true` و `javaScriptEnabled: false` می‌گیرد و همه
درخواست‌های شبکه مسدود می‌شوند. خروجی هم‌زمان ساخته و مستقیم فرستاده می‌شود؛ **صف
پس‌زمینه و ذخیره در object storage هنوز ساخته نشده‌اند**.

خروجی در object storage ذخیره و به‌صورت `report_runs.output_attachment_id` ثبت می‌شود؛
دانلود از endpoint مجوزدار با انقضا.

### چرا Excel در لایه API نشست، نه در بسته موتور

سند بالا خروجی Excel را کار لایه ۴ می‌داند. در عمل `exceljs` فقط-Node است و بسته موتور
باید ایزومورفیک بماند تا مرورگر هم بتواند قالب را چیدمان کند. پس **سند چیدمان** در
بسته موتور ساخته می‌شود و خروجی‌گیر Excel در `apps/api/modules/reporting` از همان سند
تغذیه می‌شود. نتیجه عملی همان است: قاعده جدول یک‌جا تعریف شده و HTML و Excel نمی‌توانند
از هم جدا بیفتند.

## ۸. Excel

با `exceljs`، خروجی **جدول واقعی** نه تصویر گزارش:

- سلول‌های مالی **عددی واقعی** با `numFmt` فارسی/هزارگان.
  نکته `bigint`: مقادیر بالاتر از محدوده امن عدد Excel به‌صورت متن با هشدار در سلول
  مجاور نوشته می‌شوند، نه با دقت از دست‌رفته.
- تاریخ‌ها: ستون شمسی به‌صورت متن قالب‌بندی‌شده + ستون کمکی تاریخ میلادی واقعی برای
  مرتب‌سازی و فرمول.
- ردیف جمع با **فرمول واقعی Excel** (`SUBTOTAL`)، نه مقدار ثابت.
- نام شیت: حداکثر ۳۱ نویسه، بدون `: \ / ? * [ ]`، یکتاسازی خودکار.
- **ضد Formula Injection:** هر مقدار متنی که با `= + - @`، tab یا CR شروع شود با
  `'` پیش‌وند می‌گیرد و به‌صورت متن نوشته می‌شود. تست مستقل دارد.
- سقف ردیف Excel (۱٬۰۴۸٬۵۷۶) بررسی و در صورت تجاوز، چندشیتی می‌شود.

## ۹. گزارش مالیات به‌عنوان نخستین قالب

گزارش مالیات **کد اختصاصی رندر ندارد**. در فاز ۶:

1. `report_types` ردیف `TAX_REPORT` با `data_scope_key = 'document'`.
2. `document.vendorAggregates` در لایه `financial` با قواعد §۲۲ پیاده و تست می‌شود.
3. یک قالب نسخه ۱ به‌صورت **داده مرجع** seed می‌شود (فایل JSON قابل بازبینی در مخزن).
4. صفحه پیش‌نمایش: جدول + اقدام «تعیین نوع کالا» + اقدام «جزئیات» برای هر ردیف.
5. در فاز ۷ **همان قالب** در طراح بصری باز، ویرایش و نسخه‌بندی می‌شود — که معیار پذیرش
   فاز ۷ هم همین است.

ستون‌های نسخه ۱ طبق §۲۲.۲ (با تجمیع چندخطی در سلول‌های هویتی برای خوانایی چاپ):

```
ردیف │ طرف قرارداد  │ نام فروشنده │ آدرس         │ شماره    │ تاریخ    │ نوع  │ مبلغ │ تخفیف │ خالص │ مالیات │ جمع
     │ حقیقی/حقوقی  │ ———————     │ ————         │ صورتحساب │ صورتحساب │ کالا │ کالا │       │      │ و عوارض│ کل
     │ کد ملی/      │ نام نماینده │ تلفن/کدپستی  │          │          │      │      │       │      │        │
     │ شماره اقتصادی│             │              │          │          │      │      │       │      │        │
```

> تصویر مرجع دریافت شد. چیدمان واقعی ۱۳ ستونی، سربرگ سال و فصل، و بلوک امضاها در
> [15-tax-report-reference.md](15-tax-report-reference.md) بازنویسی شده است و مبنای
> پیاده‌سازی فاز ۶ است. صفحه **افقی** انتخاب شد تا ستون‌ها بریده نشوند (ریسک R15).

## ۱۰. کنترل دسترسی موتور گزارش

| تهدید | کنترل |
|---|---|
| قالب به داده غیرمجاز اشاره کند | هر `var.path` در Data Dictionary بررسی و مجوزش با کاربر **اجراکننده** سنجیده می‌شود |
| ساخت قالب با مجوز بالا، اجرا با کاربر کم‌دسترسی | resolve داده همیشه با هویت اجراکننده؛ سازنده قالب بی‌ربط است |
| دسترسی به سند خارج از دامنه نقش | `DocumentAccessPolicy` در resolver، همان شرط کوئری مسیرهای عادی |
| XSS از طریق داده (نام فروشنده حاوی تگ) | escape اجباری در رندر؛ هیچ `dangerouslySetInnerHTML` و هیچ HTML خام از داده |
| اجرای کد در قالب | AST بسته؛ بدون eval |
| مصرف منابع (قالب با ۱۰ جدول تودرتو) | محدودیت گره/عمق/ردیف/زمان + اجرای پس‌زمینه |
| ستون با نام غلط که بی‌صدا خالی چاپ شود | مسیر `row.*` در دامنه منبع دادهٔ همان جدول (یا همان تابع تجمیعی) سنجیده می‌شود؛ ستون ناموجود خطای اعتبارسنجی است، نه سلول خالی |
| قالب بزرگ‌شده از سمت عبارت‌ها | شمارش گره **عبارت‌ها** هم در سقف `MAX_TEMPLATE_NODES` حساب می‌شود، نه فقط بلوک و ستون |
| دانلود خروجی دیگران | `report_runs` به `requested_by` بسته است؛ endpoint دانلود مجوز و مالکیت را بررسی می‌کند |
| باقی ماندن فایل موقت | `expires_at` + job پاک‌سازی دوره‌ای |
