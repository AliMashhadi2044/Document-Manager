/**
 * تشخیص نوع واقعی فایل از روی **محتوا**، نه پسوند و نه MIME اعلامی مرورگر.
 *
 * چرا دست‌ساز و نه کتابخانه: فهرست مجاز این سامانه دقیقاً چهار نوع است (PDF، JPEG،
 * PNG، TIFF). یک تشخیص‌دهنده عمومی ده‌ها قالب را می‌شناسد — یعنی سطح حمله بزرگ‌تر و
 * وسوسه «این یکی هم اضافه کن». اینجا هر نوعِ شناخته‌شده یک تصمیم آگاهانه است و
 * تشخیص، چند بایت اول را با امضای ثابت مقایسه می‌کند؛ قابل تست و بدون وابستگی.
 *
 * قاعده سخت (docs/12-file-storage-policy.md §۳): MIME اعلامی **کافی نیست**. فایلی که
 * محتوایش با پسوند و MIME اعلامی‌اش نخواند رد می‌شود، حتی اگر محتوایش خودش در فهرست
 * مجاز باشد؛ چنین ناسازگاری یا اشتباه است یا تلاش برای دور زدن فیلتر.
 */

export const UPLOAD_TYPE_KEYS = ['PDF', 'JPEG', 'PNG', 'TIFF'] as const;
export type UploadTypeKey = (typeof UPLOAD_TYPE_KEYS)[number];

export interface UploadTypeDefinition {
  readonly key: UploadTypeKey;
  readonly titleFa: string;
  /** MIME رسمی که سرور خودش هنگام دانلود می‌فرستد. */
  readonly mime: string;
  /** MIMEهایی که مرورگرها ممکن است اعلام کنند و معتبر شمرده می‌شوند. */
  readonly acceptedMimes: readonly string[];
  readonly extensions: readonly string[];
  /** امضای بایتی؛ هر ردیف یک حالت معتبر است. */
  readonly signatures: readonly { readonly offset: number; readonly bytes: readonly number[] }[];
  /** در مرورگر قابل پیش‌نمایش است؟ */
  readonly previewable: boolean;
}

export const UPLOAD_TYPES: Record<UploadTypeKey, UploadTypeDefinition> = {
  PDF: {
    key: 'PDF',
    titleFa: 'PDF',
    mime: 'application/pdf',
    acceptedMimes: ['application/pdf'],
    extensions: ['pdf'],
    // "%PDF-"
    signatures: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }],
    previewable: true,
  },
  JPEG: {
    key: 'JPEG',
    titleFa: 'تصویر JPEG',
    mime: 'image/jpeg',
    acceptedMimes: ['image/jpeg', 'image/jpg', 'image/pjpeg'],
    extensions: ['jpg', 'jpeg'],
    signatures: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
    previewable: true,
  },
  PNG: {
    key: 'PNG',
    titleFa: 'تصویر PNG',
    mime: 'image/png',
    acceptedMimes: ['image/png'],
    extensions: ['png'],
    signatures: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
    previewable: true,
  },
  TIFF: {
    key: 'TIFF',
    titleFa: 'تصویر TIFF',
    mime: 'image/tiff',
    acceptedMimes: ['image/tiff', 'image/x-tiff'],
    extensions: ['tif', 'tiff'],
    signatures: [
      { offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] }, // little-endian
      { offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] }, // big-endian
    ],
    // مرورگرها TIFF را رندر نمی‌کنند؛ UI باید پیام صریح بدهد، نه کادر خالی.
    previewable: false,
  },
};

export const UPLOAD_TYPE_LIST: readonly UploadTypeDefinition[] = UPLOAD_TYPE_KEYS.map(
  (key) => UPLOAD_TYPES[key],
);

/** `accept` مناسب برای input فایل — از همین فهرست ساخته می‌شود، نه دستی. */
export const UPLOAD_ACCEPT_ATTRIBUTE: string = UPLOAD_TYPE_LIST.flatMap((type) => [
  type.mime,
  ...type.extensions.map((extension) => `.${extension}`),
]).join(',');

export class FileValidationError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'FileValidationError';
  }
}

/** نوع واقعی فایل از روی بایت‌های ابتدایی؛ `null` یعنی هیچ نوع مجازی نیست. */
export function detectUploadType(bytes: Uint8Array): UploadTypeDefinition | null {
  for (const type of UPLOAD_TYPE_LIST) {
    for (const signature of type.signatures) {
      if (matchesSignature(bytes, signature.offset, signature.bytes)) return type;
    }
  }
  return null;
}

function matchesSignature(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
): boolean {
  if (bytes.length < offset + expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected[index]) return false;
  }
  return true;
}

/** پسوند فایل از نام اصلی؛ بدون نقطه و با حروف کوچک. */
export function fileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

export interface UploadCandidate {
  readonly filename: string;
  /** MIME اعلامی کلاینت — فقط برای **تطبیق**، نه برای تصمیم. */
  readonly declaredMime: string;
  readonly bytes: Uint8Array;
  readonly sizeBytes: number;
}

export interface UploadLimits {
  readonly maxFileBytes: number;
  readonly maxFilesPerDocument: number;
  readonly maxTotalBytesPerDocument: number;
}

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  maxFileBytes: 20 * 1024 * 1024,
  maxFilesPerDocument: 30,
  maxTotalBytesPerDocument: 200 * 1024 * 1024,
};

/**
 * اعتبارسنجی کامل یک فایل آپلودی.
 *
 * ترتیب بررسی‌ها عمدی است: ابتدا چیزهایی که بدون خواندن محتوا رد می‌شوند (نام، حجم)،
 * سپس محتوا. پیام‌ها فارسی و **مشخص**اند؛ «فایل نامعتبر است» به کاربر نمی‌گوید چه
 * کند و به مهاجم هم چیزی نمی‌دهد که ندانسته باشد.
 */
export function validateUpload(
  candidate: UploadCandidate,
  limits: UploadLimits = DEFAULT_UPLOAD_LIMITS,
): UploadTypeDefinition {
  const name = candidate.filename.trim();
  if (name === '') {
    throw new FileValidationError('نام فایل خالی است', 'FILE_NAME_EMPTY');
  }
  if (name.length > 255) {
    throw new FileValidationError('نام فایل بیش از حد طولانی است', 'FILE_NAME_TOO_LONG');
  }

  if (candidate.sizeBytes <= 0) {
    throw new FileValidationError('فایل خالی است', 'FILE_EMPTY');
  }
  if (candidate.sizeBytes > limits.maxFileBytes) {
    throw new FileValidationError(
      `حجم هر فایل حداکثر ${formatMegabytes(limits.maxFileBytes)} مگابایت است`,
      'FILE_TOO_LARGE',
    );
  }

  const extension = fileExtension(name);
  if (extension === '') {
    throw new FileValidationError('فایل باید پسوند داشته باشد', 'FILE_EXTENSION_MISSING');
  }

  const detected = detectUploadType(candidate.bytes);
  if (!detected) {
    throw new FileValidationError(
      `نوع این فایل مجاز نیست. فقط ${UPLOAD_TYPE_LIST.map((type) => type.titleFa).join('، ')} پذیرفته می‌شود.`,
      'FILE_TYPE_NOT_ALLOWED',
    );
  }

  // پسوند جعلی: محتوا PNG است ولی فایل .pdf نام دارد.
  if (!detected.extensions.includes(extension)) {
    throw new FileValidationError(
      `محتوای فایل ${detected.titleFa} است ولی پسوند آن «${extension}» است. فایل با پسوند درست دوباره ارسال شود.`,
      'FILE_EXTENSION_MISMATCH',
    );
  }

  // MIME اعلامی اگر فرستاده شده، باید با محتوا بخواند.
  const declared = candidate.declaredMime.trim().toLowerCase();
  if (declared !== '' && declared !== 'application/octet-stream') {
    if (!detected.acceptedMimes.includes(declared)) {
      throw new FileValidationError(
        `نوع اعلامی فایل («${declared}») با محتوای آن (${detected.titleFa}) نمی‌خواند`,
        'FILE_MIME_MISMATCH',
      );
    }
  }

  return detected;
}

/**
 * بازگرداندن نام فایل multipart به UTF-8.
 *
 * چرا لازم است: در `multipart/form-data` نام فایل بدون اعلام charset می‌آید و busboy
 * (زیر multer) هر بایت را یک نویسه latin1 می‌خواند. پس «اسکن سند.pdf» به شکل
 * «Ø§Ø³Ú©Ù† Ø³Ù†Ø¯.pdf» به برنامه می‌رسد و همان‌طور هم ذخیره و در هدر دانلود
 * برگردانده می‌شود.
 *
 * این نقص در آزمون زنده فاز ۵ پیدا شد؛ تست‌های واحد آن را ندیده بودند چون همه نام
 * فایل‌های آزمون ASCII بودند.
 *
 * روش: نویسه‌ها را به بایت برمی‌گردانیم و با UTF-8 سخت‌گیر رمزگشایی می‌کنیم. اگر نام
 * واقعاً latin1 بوده (یا از قبل درست رمزگشایی شده)، همان مقدار اصلی برگردانده می‌شود —
 * پس این تابع هرگز نام سالم را خراب نمی‌کند.
 */
export function decodeMultipartFilename(raw: string): string {
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index);
    // نویسه بالاتر از یک بایت یعنی رشته قبلاً درست رمزگشایی شده است.
    if (code > 0xff) return raw;
    bytes[index] = code;
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // رشته‌ای که هیچ بایت چندنویسه‌ای ندارد، با رمزگشایی عوض نمی‌شود؛ بازگرداندن
    // همان مقدار اصلی، نیت را روشن‌تر می‌کند.
    return decoded;
  } catch {
    return raw;
  }
}

/**
 * نام امن برای هدر دانلود.
 *
 * نویسه‌های کنترلی، نقل‌قول، جداکننده مسیر و نویسه‌های دوجهته حذف می‌شوند تا نه هدر
 * شکسته شود و نه نام نمایشی بتواند پسوند واقعی را پنهان کند.
 */
export function safeDownloadFilename(filename: string, fallback = 'attachment'): string {
  const cleaned = filename
    // حذف عمدی نویسه‌های کنترلی: با آن‌ها می‌توان هدر HTTP را شکست.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    // نویسه‌های کنترل جهت متن: با آن‌ها می‌توان «gnp.exe» را «exe.png» نشان داد.
    .replace(/[‪-‮⁦-⁩‎‏]/g, '')
    .trim();

  return cleaned === '' || cleaned === '.' || cleaned === '..' ? fallback : cleaned.slice(0, 200);
}

function formatMegabytes(bytes: number): number {
  return Math.floor(bytes / (1024 * 1024));
}
