import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  DATASETS,
  LIST_MARKER,
  fieldsOf,
  hasListHop,
  plainPath,
  type DatasetDefinition,
  type ReportFieldDefinition,
} from './datasets';

/**
 * فهرست مجموعه‌داده‌ها در برابر **خودِ schema**.
 *
 * چرا این تست وجود دارد: یک غلط تایپی در مسیر فیلد، خطا نمی‌داد — ستون خالی چاپ
 * می‌شد و فیلتر هیچ ردیفی نمی‌داد. یعنی بدترین شکل نقص در یک گزارش مالی: جوابی که
 * غلط است ولی شبیه جواب درست به نظر می‌رسد.
 *
 * مرجع، DMMF پریزماست و نه یک فهرست دستیِ دوم؛ پس تغییر schema اگر مسیری را از
 * بین ببرد، همین‌جا قرمز می‌شود و نه در گزارشِ کاربر.
 */

const MODELS = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [model.name, model]),
);

/** نام مدل در کلاینت (`financialDocument`) به نام schema (`FinancialDocument`). */
function modelOf(name: string) {
  const pascal = name.charAt(0).toUpperCase() + name.slice(1);
  const model = MODELS.get(pascal);
  if (!model) throw new Error(`مدل «${pascal}» در schema نیست`);
  return model;
}

/**
 * پیمایش یک مسیر از یک مدل.
 *
 * برمی‌گرداند: مشکلی که پیدا شد، یا `null` اگر مسیر سالم بود.
 */
function checkPath(modelName: string, path: string): string | null {
  const segments = path.split('.');
  let current = modelOf(modelName);

  for (let index = 0; index < segments.length; index += 1) {
    const raw = segments[index] as string;
    const isListHop = raw.endsWith(LIST_MARKER);
    const name = raw.replace(LIST_MARKER, '');

    // `_count` یک مسیر مجازی پریزماست و در DMMF فیلدی ندارد.
    if (name === '_count') return null;

    const field = current.fields.find((item) => item.name === name);
    if (!field) return `«${name}» در مدل «${current.name}» نیست`;

    const last = index === segments.length - 1;

    if (field.kind === 'object') {
      if (last) return `«${name}» یک رابطه است و نه یک مقدار`;
      if (field.isList && !isListHop) {
        return `«${name}» رابطهٔ یک‌به‌چند است و مسیر باید «${name}${LIST_MARKER}» باشد`;
      }
      if (!field.isList && isListHop) {
        return `«${name}» یک‌به‌چند نیست و نباید نشان «${LIST_MARKER}» بگیرد`;
      }
      current = modelOf(field.type);
      continue;
    }

    if (!last) return `«${name}» یک مقدار است و مسیر بعد از آن ادامه دارد`;
    if (isListHop) return `«${name}» یک مقدار است و نشان «${LIST_MARKER}» نمی‌گیرد`;
  }

  return null;
}

/** مجموعه‌داده‌های تجمیعی روی ردیف‌های در حافظه کار می‌کنند، نه روی مدل. */
const ROW_DATASETS: readonly DatasetDefinition[] = DATASETS.filter(
  (dataset) => dataset.kind === 'rows',
);

describe('فهرست مجموعه‌داده‌ها', () => {
  it('هر مسیر فیلد در schema واقعاً وجود دارد', () => {
    const problems: string[] = [];

    for (const dataset of ROW_DATASETS) {
      for (const field of dataset.fields) {
        const problem = checkPath(dataset.model, field.path);
        if (problem) problems.push(`${dataset.key}.${field.key}: ${problem}`);
      }
    }

    expect(problems).toEqual([]);
  });

  it('کلید فیلدها در هر مجموعه‌داده یکتاست', () => {
    const duplicates: string[] = [];

    for (const dataset of DATASETS) {
      const seen = new Set<string>();
      for (const field of fieldsOf(dataset)) {
        if (seen.has(field.key)) duplicates.push(`${dataset.key}.${field.key}`);
        seen.add(field.key);
      }
    }

    expect(duplicates).toEqual([]);
  });

  /*
    مرتب‌سازی روی یک رابطهٔ یک‌به‌چند معنا ندارد: یک ردیف چند مقدار دارد و پریزما
    هم چنین `orderBy`ای را نمی‌پذیرد. بستنش در تعریف، از خطای زمان اجرا بهتر است.
  */
  it('هیچ فیلد یک‌به‌چندی مرتب‌سازی‌شدنی نیست', () => {
    const sortable: string[] = [];

    for (const dataset of DATASETS) {
      for (const field of fieldsOf(dataset)) {
        if (hasListHop(field.path) && field.sortable !== false) {
          sortable.push(`${dataset.key}.${field.key}`);
        }
      }
    }

    expect(sortable).toEqual([]);
  });

  /*
    ستون پیش‌فرض باید وجود داشته باشد، وگرنه گزارش با ستونی باز می‌شود که سرور
    نمی‌شناسد — و کاربر یک جدول ناقص می‌بیند بی‌آنکه بفهمد چرا.
  */
  it('ستون‌ها و مرتب‌سازی پیش‌فرض به فیلدهای موجود اشاره می‌کنند', () => {
    const problems: string[] = [];

    for (const dataset of DATASETS) {
      const keys = new Set(fieldsOf(dataset).map((field) => field.key));
      for (const column of dataset.defaultColumns) {
        if (!keys.has(column)) problems.push(`${dataset.key}: ستون پیش‌فرض «${column}»`);
      }
      for (const entry of dataset.defaultSort) {
        if (!keys.has(entry.field)) problems.push(`${dataset.key}: مرتب‌سازی «${entry.field}»`);
      }
    }

    expect(problems).toEqual([]);
  });

  /** نشان `[]` فقط روی رابطه معنا دارد؛ `plainPath` باید همیشه پاکش کند. */
  it('مسیر ساده هیچ نشانی ندارد', () => {
    const all: ReportFieldDefinition[] = DATASETS.flatMap((dataset) => [...fieldsOf(dataset)]);
    for (const field of all) {
      expect(plainPath(field.path)).not.toContain(LIST_MARKER);
    }
  });

  /*
    فهرست گزینه‌های یک فیلد از یک مدل **دیگر** خوانده می‌شود؛ پس ستون و مسیر دامنه‌اش
    هم باید در schema باشند، وگرنه فیلتر به‌جای فهرست، خطای زمان اجرا می‌دهد.
  */
  it('منبع گزینه‌های فیلتر در schema وجود دارد', () => {
    const problems: string[] = [];

    for (const dataset of DATASETS) {
      for (const field of fieldsOf(dataset)) {
        const source = field.optionsFrom;
        if (!source) continue;

        const column = checkPath(source.model, source.column);
        if (column) problems.push(`${dataset.key}.${field.key} ستون: ${column}`);

        const scope = checkPath(source.model, `${source.documentPath}.id`);
        if (scope) problems.push(`${dataset.key}.${field.key} دامنه: ${scope}`);
      }
    }

    expect(problems).toEqual([]);
  });
});
