import { describe, expect, it } from 'vitest';

import { buildHash, parseHash } from './routing';

/**
 * خواندن نشانی.
 *
 * ارزش این تست‌ها در ورودی‌های **بد** است: نشانی تنها جایی از رابط است که کاربر
 * می‌تواند هر چیزی در آن بنویسد — یا لینکی از جای دیگری باز کند.
 */
describe('خواندن مسیر از نشانی', () => {
  it('بخش و شناسه را می‌خواند', () => {
    expect(parseHash('#/documents/abc-123')).toEqual({ section: 'documents', id: 'abc-123' });
    expect(parseHash('#/reports')).toEqual({ section: 'reports', id: null });
    // بدون اسلشِ آغازین هم همان است؛ بعضی مرورگرها و لینک‌ها این‌طور می‌دهند.
    expect(parseHash('#archive')).toEqual({ section: 'archive', id: null });
  });

  it('نشانی خالی یعنی مسیری در کار نیست', () => {
    expect(parseHash('')).toBeNull();
    expect(parseHash('#')).toBeNull();
    expect(parseHash('#/')).toBeNull();
  });

  it('بخشِ بدشکل رد می‌شود', () => {
    // «بخش» فقط یک کلید داخلی است؛ هر چیز دیگری یعنی نشانی دستکاری شده.
    expect(parseHash('#/Documents')).toBeNull();
    expect(parseHash('#/<script>')).toBeNull();
    expect(parseHash(`#/${'x'.repeat(50)}`)).toBeNull();
  });

  it('شناسهٔ بدشکل بخش را از بین نمی‌برد', () => {
    // کاربر باید به بخش برسد، حتی اگر دنبالهٔ نشانی خراب باشد.
    expect(parseHash('#/documents/not a uuid')).toEqual({ section: 'documents', id: null });
    expect(parseHash('#/documents/../../etc')).toEqual({ section: 'documents', id: null });
  });

  it('ساختن نشانی، وارونِ خواندن آن است', () => {
    expect(parseHash(buildHash('documents', 'abc-123'))).toEqual({
      section: 'documents',
      id: 'abc-123',
    });
    expect(parseHash(buildHash('vendors'))).toEqual({ section: 'vendors', id: null });
    expect(parseHash(buildHash('vendors', null))).toEqual({ section: 'vendors', id: null });
  });
});
