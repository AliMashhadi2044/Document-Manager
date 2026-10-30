/**
 * مسیر صفحه در نشانی، به شکل `#/بخش` و `#/بخش/شناسه`.
 *
 * تا پیش از این، نشانی همیشه یکی بود: رفرش کاربر را به بخش پیش‌فرض می‌برد،
 * دکمهٔ «برگشت» مرورگر از کل برنامه بیرون می‌انداخت، و «این سند را ببین» برای
 * همکار، یعنی گفتنِ شفاهی شمارهٔ سند.
 *
 * **چرا hash و نه History API:** سرور هر مسیر غیر از `/api` را به `index.html`
 * می‌دهد، پس هر دو کار می‌کنند؛ ولی hash به هیچ تنظیمی در proxy یا وب‌سرور
 * وابسته نیست. سامانه در شبکهٔ داخلی و پشت پیکربندی‌هایی نصب می‌شود که ما
 * نمی‌بینیمشان، و مسیری که با یک تنظیم غلط ۴۰۴ می‌شود، بدتر از نبودنش است.
 *
 * نشانی **دسترسی نمی‌دهد**: بخش با مجوزهای همان کاربر سنجیده می‌شود و شناسهٔ سند
 * هم مثل همیشه از سرور خوانده می‌شود. مرجع دسترسی، سرور است.
 */

export interface Route {
  readonly section: string;
  /** شناسهٔ سند یا گزارشِ باز، اگر نشانی آن را داشته باشد. */
  readonly id: string | null;
}

/** حروف مجاز در شناسه — uuid و مانندش؛ هر چیز دیگری نادیده گرفته می‌شود. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
const SECTION_PATTERN = /^[a-z-]{1,40}$/u;

export function parseHash(hash: string): Route | null {
  const raw = hash.replace(/^#\/?/u, '');
  if (raw === '') return null;

  const [section = '', id = ''] = raw.split('/', 2);
  if (!SECTION_PATTERN.test(section)) return null;

  return { section, id: ID_PATTERN.test(id) ? id : null };
}

export function buildHash(section: string, id?: string | null): string {
  return id ? `#/${section}/${id}` : `#/${section}`;
}
