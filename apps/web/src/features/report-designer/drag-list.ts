import { useState, type DragEvent } from 'react';

/**
 * جابه‌جایی با کشیدن و رها کردن، روی API بومی مرورگر.
 *
 * چرا کتابخانه‌ای اضافه نشد: کل نیاز این طراح «فهرستی که ترتیبش با کشیدن عوض شود»
 * است و HTML5 drag & drop همین را می‌دهد. یک وابستگی تازه برای این کار، هم حجم
 * باندل است و هم یک سطح نگهداری.
 *
 * **و کشیدن، تنها راه نیست.** هر ردیف دکمه بالا/پایین هم دارد: کشیدن و رها کردن با
 * صفحه‌کلید و صفحه‌خوان کار نمی‌کند و اگر تنها راه بود، طراح برای بخشی از کاربران
 * بی‌استفاده می‌شد.
 */
export function useDragList(onMove: (from: number, to: number) => void): {
  readonly draggingIndex: number | null;
  readonly overIndex: number | null;
  itemProps: (index: number) => {
    draggable: true;
    onDragStart: (event: DragEvent<HTMLElement>) => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: () => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
  };
} {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return {
    draggingIndex,
    overIndex,
    itemProps: (index: number) => ({
      draggable: true,
      onDragStart: (event) => {
        setDraggingIndex(index);
        event.dataTransfer.effectAllowed = 'move';
        // بعضی مرورگرها بدون داده، کشیدن را شروع نمی‌کنند.
        event.dataTransfer.setData('text/plain', String(index));
      },
      onDragOver: (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setOverIndex(index);
      },
      onDragLeave: () => setOverIndex((current) => (current === index ? null : current)),
      onDrop: (event) => {
        event.preventDefault();
        const from = draggingIndex ?? Number(event.dataTransfer.getData('text/plain'));
        setDraggingIndex(null);
        setOverIndex(null);
        if (!Number.isInteger(from) || from === index) return;
        onMove(from, index);
      },
      onDragEnd: () => {
        setDraggingIndex(null);
        setOverIndex(null);
      },
    }),
  };
}
