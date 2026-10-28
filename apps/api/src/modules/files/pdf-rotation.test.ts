import { PDFDocument, degrees } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { rotatePdf } from './pdf-rotation';

/**
 * چرخش فایل دانلودی.
 *
 * ادعای اصلی: آنچه کاربر در نمایشگر دید، همان چیزی است که دانلود می‌کند. نمایشگر
 * چرخش کاربر را با چرخش ذاتی برگه **جمع** می‌کند، پس اینجا هم باید جمع شود — و
 * همین نکته‌ای است که اگر غلط باشد، فایل دانلودی کج درمی‌آید و هیچ تستِ «خطا نداد»
 * آن را نمی‌گیرد.
 */
async function samplePdf(rotations: readonly number[]): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (const angle of rotations) {
    const page = document.addPage([595, 842]);
    page.setRotation(degrees(angle));
  }
  return Buffer.from(await document.save());
}

async function anglesOf(bytes: Buffer): Promise<number[]> {
  const document = await PDFDocument.load(bytes);
  return document.getPages().map((page) => page.getRotation().angle);
}

describe('چرخش برگه‌های فایل دانلودی', () => {
  it('چرخش کاربر به چرخش ذاتی برگه اضافه می‌شود', async () => {
    const original = await samplePdf([0, 90, 270]);

    const rotated = await rotatePdf(
      original,
      new Map([
        [1, 90],
        [2, 180],
        [3, 180],
      ]),
    );

    // ۰+۹۰، ۹۰+۱۸۰، و ۲۷۰+۱۸۰ که از ۳۶۰ رد می‌شود و به ۹۰ برمی‌گردد.
    expect(await anglesOf(rotated)).toEqual([90, 270, 90]);
  });

  it('برگه‌ای که چرخشی برایش ثبت نشده، دست‌نخورده می‌ماند', async () => {
    const rotated = await rotatePdf(await samplePdf([0, 90]), new Map([[1, 90]]));
    expect(await anglesOf(rotated)).toEqual([90, 90]);
  });

  /** نبودِ چرخش نباید فایل را بازنویسی کند؛ همان بایت‌های اصلی برمی‌گردند. */
  it('بدون چرخش، همان بایت‌های اصلی برمی‌گردند', async () => {
    const original = await samplePdf([0]);
    expect(await rotatePdf(original, new Map())).toBe(original);
  });

  /** شمارهٔ برگه‌ای که وجود ندارد، نباید دانلود را بیندازد. */
  it('شمارهٔ برگهٔ خارج از محدوده نادیده گرفته می‌شود', async () => {
    const rotated = await rotatePdf(
      await samplePdf([0]),
      new Map([
        [1, 90],
        [7, 180],
      ]),
    );
    expect(await anglesOf(rotated)).toEqual([90]);
  });
});
