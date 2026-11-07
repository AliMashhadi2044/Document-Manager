import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ZodBody, droppedKeys } from './zod.pipe';

/**
 * کلیدی که فرم می‌فرستد و schema نمی‌شناسد.
 *
 * zod آن را خاموشانه دور می‌اندازد و پاسخ ۲۰۰ برمی‌گردد؛ کاربر پیام «ذخیره شد»
 * می‌گیرد و هیچ‌چیز عوض نشده. ویرایش شماره و تاریخ گردشِ سند همین بود. این هشدار،
 * همان حالت را **دیدنی** می‌کند.
 */
describe('کلیدهای دورانداخته‌شده', () => {
  it('کلید ناشناخته را پیدا می‌کند', () => {
    expect(droppedKeys({ a: 1, b: 2 }, { a: 1 })).toEqual(['b']);
  });

  it('کلیدِ گم‌شده در شیء تودرتو را هم پیدا می‌کند', () => {
    expect(droppedKeys({ p: { x: 1, y: 2 } }, { p: { x: 1 } })).toEqual(['p.y']);
  });

  it('درون آرایه هم می‌گردد', () => {
    expect(droppedKeys({ items: [{ a: 1, b: 2 }] }, { items: [{ a: 1 }] })).toEqual([
      'items[0].b',
    ]);
  });

  it('بدنهٔ هم‌شکل، هشداری ندارد', () => {
    expect(droppedKeys({ a: 1, p: { x: 1 } }, { a: 1, p: { x: 1 } })).toEqual([]);
  });

  it('`undefined` صریح، چیزی برای از دست دادن نیست', () => {
    expect(droppedKeys({ a: undefined }, {})).toEqual([]);
  });

  /*
    مقدارِ پیش‌فرض، کلیدی **اضافه** می‌کند و نه کم؛ این نباید هشدار بسازد — وگرنه
    هشدار آن‌قدر پرسروصدا می‌شد که کسی نگاهش نمی‌کرد.
  */
  it('کلیدی که schema با پیش‌فرض می‌سازد، هشدار نیست', () => {
    const schema = z.object({ a: z.string(), b: z.boolean().default(false) });
    const parsed = schema.parse({ a: 'x' });
    expect(droppedKeys({ a: 'x' }, parsed)).toEqual([]);
  });

  it('pipe مقدار معتبر را همان‌طور برمی‌گرداند', () => {
    const pipe = new ZodBody(z.object({ a: z.string() }));
    expect(pipe.transform({ a: 'ok', extra: 1 }, {} as never)).toEqual({ a: 'ok' });
  });
});
