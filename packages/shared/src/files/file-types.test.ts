import { describe, expect, it } from 'vitest';

import {
  DEFAULT_UPLOAD_LIMITS,
  FileValidationError,
  UPLOAD_ACCEPT_ATTRIBUTE,
  UPLOAD_TYPE_KEYS,
  UPLOAD_TYPES,
  detectUploadType,
  fileExtension,
  safeDownloadFilename,
  validateUpload,
} from './file-types.js';

/** بایت‌های واقعی ابتدای هر قالب، به‌علاوه مقداری محتوای دلخواه. */
const SAMPLES = {
  pdf: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25]),
  jpeg: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
  png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]),
  tiffLe: Uint8Array.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]),
  tiffBe: Uint8Array.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]),
  html: new TextEncoder().encode('<html><script>alert(1)</script></html>'),
  svg: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
  zip: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
  exe: Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]),
};

describe('تشخیص نوع فایل از محتوا', () => {
  it('چهار نوع مجاز را از روی امضا می‌شناسد', () => {
    expect(detectUploadType(SAMPLES.pdf)?.key).toBe('PDF');
    expect(detectUploadType(SAMPLES.jpeg)?.key).toBe('JPEG');
    expect(detectUploadType(SAMPLES.png)?.key).toBe('PNG');
    expect(detectUploadType(SAMPLES.tiffLe)?.key).toBe('TIFF');
    expect(detectUploadType(SAMPLES.tiffBe)?.key).toBe('TIFF');
  });

  it('قالب‌های خطرناک و غیرمجاز را نمی‌شناسد', () => {
    expect(detectUploadType(SAMPLES.html)).toBeNull();
    expect(detectUploadType(SAMPLES.svg)).toBeNull();
    expect(detectUploadType(SAMPLES.zip)).toBeNull();
    expect(detectUploadType(SAMPLES.exe)).toBeNull();
    expect(detectUploadType(new Uint8Array(0))).toBeNull();
  });

  it('فایل کوتاه‌تر از امضا، خطا نمی‌دهد و فقط شناخته نمی‌شود', () => {
    expect(detectUploadType(Uint8Array.from([0x89, 0x50]))).toBeNull();
  });
});

describe('اعتبارسنجی آپلود', () => {
  const candidate = (over: Partial<Parameters<typeof validateUpload>[0]> = {}) => ({
    filename: 'scan.pdf',
    declaredMime: 'application/pdf',
    bytes: SAMPLES.pdf,
    sizeBytes: SAMPLES.pdf.length,
    ...over,
  });

  it('فایل سالم پذیرفته می‌شود', () => {
    expect(validateUpload(candidate()).key).toBe('PDF');
    expect(
      validateUpload(
        candidate({ filename: 'عکس سند.JPG', declaredMime: 'image/jpeg', bytes: SAMPLES.jpeg }),
      ).key,
    ).toBe('JPEG');
  });

  /** معیار پذیرش ۵ فاز ۵: فایل با پسوند جعلی رد می‌شود. */
  it('فایل PNG با پسوند pdf رد می‌شود', () => {
    try {
      validateUpload(candidate({ filename: 'سند.pdf', bytes: SAMPLES.png, declaredMime: '' }));
      expect.unreachable('باید رد می‌شد');
    } catch (error) {
      expect(error).toBeInstanceOf(FileValidationError);
      expect((error as FileValidationError).code).toBe('FILE_EXTENSION_MISMATCH');
    }
  });

  it('فایل HTML با پسوند pdf رد می‌شود، چون محتوایش اصلاً مجاز نیست', () => {
    try {
      validateUpload(
        candidate({
          filename: 'سند.pdf',
          declaredMime: 'application/pdf',
          bytes: SAMPLES.html,
          sizeBytes: SAMPLES.html.length,
        }),
      );
      expect.unreachable('باید رد می‌شد');
    } catch (error) {
      expect((error as FileValidationError).code).toBe('FILE_TYPE_NOT_ALLOWED');
    }
  });

  it('MIME اعلامی ناسازگار با محتوا رد می‌شود', () => {
    try {
      validateUpload(candidate({ declaredMime: 'image/png' }));
      expect.unreachable('باید رد می‌شد');
    } catch (error) {
      expect((error as FileValidationError).code).toBe('FILE_MIME_MISMATCH');
    }
  });

  it('MIME عمومی مرورگر (octet-stream) مانع نمی‌شود، چون تصمیم با محتواست', () => {
    expect(validateUpload(candidate({ declaredMime: 'application/octet-stream' })).key).toBe('PDF');
    expect(validateUpload(candidate({ declaredMime: '' })).key).toBe('PDF');
  });

  it('فایل بدون پسوند، خالی و بزرگ‌تر از حد مجاز رد می‌شوند', () => {
    expect(() => validateUpload(candidate({ filename: 'scan' }))).toThrowError(/پسوند/);
    expect(() => validateUpload(candidate({ sizeBytes: 0 }))).toThrowError(/خالی/);
    expect(() =>
      validateUpload(candidate({ sizeBytes: DEFAULT_UPLOAD_LIMITS.maxFileBytes + 1 })),
    ).toThrowError(/۲۰|20/);
  });

  it('پسوند بزرگ‌نویس و نام فارسی مشکلی ندارند', () => {
    expect(
      validateUpload(
        candidate({ filename: 'پیوست سند ۱۴۰۵.PDF', declaredMime: 'application/pdf' }),
      ).key,
    ).toBe('PDF');
  });
});

describe('نام فایل برای هدر دانلود', () => {
  it('نویسه‌های مسیر و کنترلی حذف می‌شوند', () => {
    expect(safeDownloadFilename('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(safeDownloadFilename('a\u0000b.pdf')).toBe('ab.pdf');
    expect(safeDownloadFilename('با "نقل‌قول".pdf')).toBe('با _نقل‌قول_.pdf');
  });

  it('نویسه وارونه‌ساز جهت که پسوند را جعل می‌کند حذف می‌شود', () => {
    // با U+202E نام «gnp.exe» روی صفحه «exe.png» دیده می‌شود.
    expect(safeDownloadFilename('فاکتور‮gnp.exe')).toBe('فاکتورgnp.exe');
  });

  it('نام خالی یا فقط نقطه به نام جایگزین می‌رسد', () => {
    expect(safeDownloadFilename('   ')).toBe('attachment');
    expect(safeDownloadFilename('..')).toBe('attachment');
  });
});

describe('فهرست انواع مجاز', () => {
  it('همه کلیدها تعریف شده‌اند و TIFF قابل پیش‌نمایش نیست', () => {
    for (const key of UPLOAD_TYPE_KEYS) {
      expect(UPLOAD_TYPES[key].key).toBe(key);
      expect(UPLOAD_TYPES[key].extensions.length).toBeGreaterThan(0);
    }
    // مرورگر TIFF را رندر نمی‌کند؛ UI باید پیام صریح بدهد (معیار پذیرش ۶).
    expect(UPLOAD_TYPES.TIFF.previewable).toBe(false);
    expect(UPLOAD_TYPES.PDF.previewable).toBe(true);
  });

  it('accept از همان فهرست ساخته می‌شود', () => {
    expect(UPLOAD_ACCEPT_ATTRIBUTE).toContain('application/pdf');
    expect(UPLOAD_ACCEPT_ATTRIBUTE).toContain('.tiff');
    expect(UPLOAD_ACCEPT_ATTRIBUTE).not.toContain('svg');
  });

  it('پسوند از نام استخراج می‌شود', () => {
    expect(fileExtension('a.b.PDF')).toBe('pdf');
    expect(fileExtension('noext')).toBe('');
    expect(fileExtension('.hidden')).toBe('');
    expect(fileExtension('trailing.')).toBe('');
  });
});
