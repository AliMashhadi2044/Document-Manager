import { PDFDocument, degrees } from 'pdf-lib';

/**
 * اعمال چرخش کاربر روی بایت‌های یک PDF.
 *
 * ─────── چرا روی نسخهٔ دانلودی و نه روی خودِ فایل ───────
 *
 * شیء ذخیره‌شده و `checksum_sha256`اش سند بایگانی‌اند و باید بایت‌به‌بایت
 * دست‌نخورده بمانند. پس فایلِ ذخیره‌شده هیچ‌وقت بازنویسی نمی‌شود؛ فقط **نسخه‌ای که
 * دانلود می‌شود** چرخانده می‌شود، همان‌طور که کاربر در نمایشگر دیده بود.
 *
 * ─────── چرا جمع و نه جایگزینی ───────
 *
 * خیلی از اسکنرها خودشان `/Rotate` می‌گذارند. اگر مقدار کاربر جایگزین آن می‌شد،
 * برگه‌ای که در نمایشگر صاف بود در فایل دانلودی کج می‌افتاد — چون نمایشگر هم چرخش
 * ذاتی را با چرخش کاربر **جمع** می‌کند.
 */
export async function rotatePdf(
  bytes: Buffer,
  rotations: ReadonlyMap<number, number>,
): Promise<Buffer> {
  if (rotations.size === 0) return bytes;

  /*
    `ignoreEncryption` عمدی است: فایل رمزدار باید **همان‌طور که هست** تحویل شود و نه
    با خطا. اگر pdf-lib نتواند بازش کند، تابع بایت‌های اصلی را برمی‌گرداند.
  */
  const document = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = document.getPages();

  for (const [pageNumber, rotation] of rotations) {
    const page = pages[pageNumber - 1];
    if (!page) continue;

    const current = page.getRotation().angle;
    page.setRotation(degrees((((current + rotation) % 360) + 360) % 360));
  }

  return Buffer.from(await document.save());
}
