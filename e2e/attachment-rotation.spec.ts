import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, degrees } from 'pdf-lib';

import { gotoSection, login, pickOption, unique } from './helpers';

/**
 * چرخش برگه‌های اسکن.
 *
 * سه ادعا، که هر سه با هم «چرخاندن» را واقعی می‌کنند:
 *
 *  ۱. کاربر برگه را می‌چرخاند و همان‌جا می‌بیند.
 *  ۲. چرخش **می‌ماند**: نمایشگر بسته و دوباره باز می‌شود و برگه هنوز چرخیده است.
 *     (ذخیره روی سرور است و نه در مرورگر؛ وگرنه برای کاربر بعدی کج می‌ماند.)
 *  ۳. فایل دانلودی همان چیزی است که دیده شد — چرخش در خودِ بایت‌های فایل.
 */

async function samplePdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage([595, 842]);
  // برگهٔ دوم از قبل چرخیده است: چرخش کاربر باید روی آن **جمع** شود.
  document.addPage([595, 842]).setRotation(degrees(90));
  return Buffer.from(await document.save());
}

async function newDocument(page: Page, title: string): Promise<void> {
  await gotoSection(page, 'اسناد');
  await page.getByRole('button', { name: 'ایجاد سند', exact: true }).first().click();

  const form = page.locator('form').filter({ has: page.getByLabel('شرح سند') });
  await page.getByLabel('شرح سند').fill(title);
  await pickOption(page, 'مجموعه خریدار');
  await form.getByRole('button', { name: 'ایجاد سند' }).click();
  await expect(page.getByText('سند ایجاد شد.')).toBeVisible();
  await page.getByRole('button', { name: title }).click();
}

test.describe('چرخش برگه‌های پیوست', () => {
  test('چرخش می‌ماند و در فایل دانلودی هم هست', async ({ page }) => {
    const title = unique('سند چرخش');

    await login(page, 'procurement');
    await newDocument(page, title);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'scan.pdf',
      mimeType: 'application/pdf',
      buffer: await samplePdf(),
    });
    await expect(page.getByText('scan.pdf')).toBeVisible();

    // ───── چرخاندن ─────
    await page.getByRole('button', { name: 'پیش‌نمایش' }).first().click();
    const viewer = page.getByRole('dialog', { name: 'scan.pdf' });
    await expect(viewer).toBeVisible();

    const rotate = viewer.getByRole('button', { name: /چرخش برگهٔ .* به راست/u });
    await expect(rotate, 'کارپردازی دکمهٔ چرخش را نمی‌بیند').toBeVisible();
    await rotate.click();

    await expect(viewer.getByText('۱ برگهٔ چرخیده')).toBeVisible();

    // ───── ماندگاری: بستن و باز کردن دوباره ─────
    await viewer.getByRole('button', { name: 'بستن' }).click();
    await expect(viewer).toHaveCount(0);

    await page.getByRole('button', { name: 'پیش‌نمایش' }).first().click();
    const reopened = page.getByRole('dialog', { name: 'scan.pdf' });
    await expect(
      reopened.getByText('۱ برگهٔ چرخیده'),
      'چرخش پس از باز کردن دوباره از بین رفت',
    ).toBeVisible();

    // ───── فایل دانلودی ─────
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      reopened.getByRole('button', { name: 'دانلود فایل' }).click(),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);

    const saved = await PDFDocument.load(Buffer.concat(chunks));
    const angles = saved.getPages().map((item) => item.getRotation().angle);

    /*
      برگهٔ اول ۹۰ درجه چرخیده و برگهٔ دوم دست‌نخورده مانده — یعنی همان ۹۰ درجهٔ
      ذاتی خودش. اگر چرخش کاربر **جایگزین** چرخش ذاتی می‌شد، این عدد ۰ می‌بود.
    */
    expect(angles).toEqual([90, 90]);
  });
});
