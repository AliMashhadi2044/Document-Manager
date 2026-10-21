import { describe, expect, it } from 'vitest';

import {
  EMPTY_PREFS,
  applyOrder,
  loadPrefs,
  moveInGroup,
  normalizeFa,
  optionMatches,
  savePrefs,
  splitPinned,
  togglePinned,
} from './select-prefs';

const options = [
  { value: 'a', label: 'آب' },
  { value: 'b', label: 'برق' },
  { value: 'c', label: 'گاز' },
  { value: 'd', label: 'تلفن' },
];

describe('applyOrder', () => {
  it('ترتیب طبیعی را وقتی ترجیحی نیست نگه می‌دارد', () => {
    expect(applyOrder(options, []).map((item) => item.value)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('گزینه‌های نام‌برده را جلو می‌آورد', () => {
    expect(applyOrder(options, ['c', 'a']).map((item) => item.value)).toEqual([
      'c',
      'a',
      'b',
      'd',
    ]);
  });

  it('گزینه تازه‌ای که در ترجیح نیست حذف نمی‌شود', () => {
    const withNew = [...options, { value: 'e', label: 'آنتن' }];
    expect(applyOrder(withNew, ['d']).map((item) => item.value)).toEqual([
      'd',
      'a',
      'b',
      'c',
      'e',
    ]);
  });

  it('شناسه‌ای که دیگر وجود ندارد چیدمان را خراب نمی‌کند', () => {
    expect(applyOrder(options, ['zz', 'b']).map((item) => item.value)).toEqual([
      'b',
      'a',
      'c',
      'd',
    ]);
  });
});

describe('splitPinned', () => {
  it('پین‌شده‌ها را به ترتیبِ پین کردن جدا می‌کند', () => {
    const result = splitPinned(options, ['c', 'a']);
    expect(result.pinned.map((item) => item.value)).toEqual(['c', 'a']);
    expect(result.rest.map((item) => item.value)).toEqual(['b', 'd']);
  });

  it('پین‌شده‌ای که در صفحه نتایج نیست با عنوان ذخیره‌شده ساخته می‌شود', () => {
    const result = splitPinned(options, ['zz'], (value) =>
      value === 'zz' ? { value, label: 'مدرسه شهید رجایی' } : null,
    );
    expect(result.pinned).toEqual([{ value: 'zz', label: 'مدرسه شهید رجایی' }]);
    expect(result.rest).toHaveLength(4);
  });

  it('بدون جایگزین، پین‌شده ناموجود نادیده گرفته می‌شود', () => {
    expect(splitPinned(options, ['zz']).pinned).toEqual([]);
  });
});

describe('moveInGroup', () => {
  const arranged = ['a', 'b', 'c', 'd'];

  it('گزینه را با همسایه‌اش عوض می‌کند', () => {
    expect(moveInGroup(arranged, ['b', 'c', 'd'], 'c', -1)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('در ابتدای گروه، بالا رفتن بی‌اثر است', () => {
    expect(moveInGroup(arranged, ['b', 'c', 'd'], 'b', -1)).toEqual(arranged);
  });

  it('جابه‌جایی از مرز گروه بیرون نمی‌رود', () => {
    // «b» اولِ گروهِ دوم است؛ بالا رفتنش نباید آن را میان پین‌شده‌ها ببرد.
    const result = moveInGroup(arranged, ['b', 'c'], 'b', -1);
    expect(result).toEqual(arranged);
  });
});

describe('togglePinned', () => {
  it('اضافه و حذف می‌کند و ترتیب را نگه می‌دارد', () => {
    expect(togglePinned(['a'], 'b')).toEqual(['a', 'b']);
    expect(togglePinned(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('normalizeFa', () => {
  it('ی و ك عربی را فارسی می‌کند', () => {
    expect(normalizeFa('كتاب')).toBe(normalizeFa('کتاب'));
    expect(normalizeFa('مدرسه‌ي نمونه')).toBe(normalizeFa('مدرسه‌ی نمونه'));
  });

  it('ارقام فارسی و عربی را با لاتین یکی می‌کند', () => {
    expect(normalizeFa('۱۴۰۵')).toBe('1405');
    expect(normalizeFa('١٤٠٥')).toBe('1405');
  });

  it('نیم‌فاصله و اعراب را حذف می‌کند', () => {
    expect(normalizeFa('می‌رود')).toBe(normalizeFa('میرود'));
    expect(normalizeFa('مَدرسه')).toBe(normalizeFa('مدرسه'));
  });
});

describe('optionMatches', () => {
  it('متن خالی همه را می‌پذیرد', () => {
    expect(optionMatches({ label: 'برق' }, '')).toBe(true);
  });

  it('روی عنوان و توضیح، هر دو، می‌خواند', () => {
    const option = { label: 'مدرسه نمونه', description: 'ناحیه ۲' };
    expect(optionMatches(option, 'نمونه')).toBe(true);
    expect(optionMatches(option, 'ناحیه 2')).toBe(true);
    expect(optionMatches(option, 'دبیرستان')).toBe(false);
  });

  it('اختلاف املای عربی مانع یافتن نمی‌شود', () => {
    expect(optionMatches({ label: 'کتابخانه' }, 'كتاب')).toBe(true);
  });
});

describe('loadPrefs / savePrefs', () => {
  it('بدون localStorage هم خطا نمی‌دهد و ترجیح خالی می‌دهد', () => {
    // محیط تست node است و `window` وجود ندارد؛ همان مسیری که در مرورگرِ
    // حالت ناشناس هم طی می‌شود.
    expect(loadPrefs('any')).toEqual(EMPTY_PREFS);
    expect(() => savePrefs('any', { pinned: ['a'], order: [], labels: {} })).not.toThrow();
  });

  it('کلید null یعنی ذخیره‌ای در کار نیست', () => {
    expect(loadPrefs(null)).toEqual(EMPTY_PREFS);
  });
});
