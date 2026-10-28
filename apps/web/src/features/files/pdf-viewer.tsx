import { useCallback, useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { ErrorState, LoadingState } from '../../shared/ui/states';
import { toPersianDigits } from '../../shared/format/money';

/**
 * نمایشگر PDF روی pdf.js.
 *
 * ─────── چرا pdf.js و نه `<iframe>` ───────
 *
 * نمایشگر داخلی مرورگر در قاب، نه زوم قابل کنترل می‌دهد، نه شمارهٔ صفحه، نه راهی
 * برای هماهنگ کردن ظاهرش با سامانه — و در فایرفاکس و سافاری هر کدام چیز دیگری‌اند.
 * pdf.js همان موتوری است که فایرفاکس استفاده می‌کند و همه‌جا یک رفتار دارد.
 *
 * ─────── چرا صفحه‌ها پنجره‌ای رندر می‌شوند ───────
 *
 * یک اسکن ۲۰۰ صفحه‌ای اگر یک‌جا رندر شود، دویست بوم تمام‌اندازه در حافظه می‌ماند و
 * مرورگر برای چند ثانیه قفل می‌کند. اینجا **فقط صفحه‌های نزدیک به دید** رندر
 * می‌شوند: هر صفحه از ابتدا جای خودش را دارد (اندازه‌اش را pdf.js بدون رندر هم
 * می‌دهد)، پس نوار اسکرول از همان اول درست است و پرش ندارد؛ و با دور شدن یک صفحه،
 * بومش آزاد می‌شود. حافظه ثابت می‌ماند، مستقل از تعداد صفحه.
 *
 * ─────── چرا بایت‌ها از قبل آماده‌اند ───────
 *
 * سرویس API هدر `frame-ancestors 'none'` می‌فرستد و خودش هم کوکی نشست می‌خواهد؛
 * فراخواننده بایت‌ها را یک‌بار با `fetch` هم‌مبدأ می‌گیرد و همان را اینجا می‌دهد.
 */

GlobalWorkerOptions.workerSrc = workerUrl;

/*
  جدول‌های نویسه و قلم‌های استاندارد.

  PDFی که قلمش را جاسازی نکرده — خروجی Word و بیشتر اسکنرها — بدون این‌ها یا
  نویسه‌های اشتباه نشان می‌دهد یا اصلاً باز نمی‌شود. pdf.js این فایل‌ها را فقط
  **هنگام نیاز** می‌گیرد، پس وزنشان روی بارگذاری سامانه نمی‌نشیند.

  مسیرها نسبت به ریشهٔ سایت‌اند و فایل‌ها در `public/pdfjs/` نشسته‌اند؛ `/` پایانی
  اجباری است، وگرنه pdf.js نشانی را اشتباه می‌سازد.
*/
const PDF_ASSETS = {
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
} as const;

/**
 * ترجمهٔ خطای pdf.js به جمله‌ای که کاربر بتواند با آن کاری بکند.
 *
 * پیش از این هر شکستی به یک پیام واحد می‌رسید («خواندن فایل ناموفق بود») و کاربر
 * نمی‌فهمید فایلش رمز دارد، خراب است، یا مشکل از جای دیگری است.
 */
function describeFailure(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? '';
  const message = (error as { message?: string } | null)?.message ?? '';

  if (name === 'PasswordException') {
    return 'این فایل با رمز عبور محافظت شده است و در سامانه باز نمی‌شود. فایل بدون رمز را بارگذاری کنید.';
  }
  if (name === 'InvalidPDFException') {
    return 'ساختار این فایل PDF معتبر نیست؛ احتمالاً هنگام ساخت یا انتقال ناقص مانده است.';
  }
  if (name === 'MissingPDFException') {
    return 'محتوای فایل خوانده نشد.';
  }

  return message === '' ? 'خطای نامشخص هنگام خواندن فایل.' : message;
}

/** اندازهٔ جایگزین برای صفحه‌ای که اندازه‌اش خوانده نشد — نقطه‌های A4. */
const A4 = { width: 595, height: 842 } as const;

export interface PdfViewerHandle {
  readonly pageCount: number;
  readonly currentPage: number;
}

export function PdfViewer({
  data,
  scale,
  rotations,
  onState,
}: {
  /** بایت‌های فایل. مالکیتش با فراخواننده است. */
  data: ArrayBuffer;
  scale: number;
  /**
   * چرخش کاربر برای هر برگه، **افزوده** بر چرخش ذاتی خودِ برگه در فایل.
   *
   * جمع شدن عمدی است و نه جایگزینی: خیلی از اسکنرها خودشان `/Rotate` می‌گذارند و
   * اگر مقدار کاربر جایش را می‌گرفت، یک کلیک روی برگه‌ای که از قبل چرخیده بود آن
   * را به جای ۹۰ درجه، به صفر می‌برد. سرور هم هنگام ساختن فایل دانلودی همین کار
   * را می‌کند، پس «آنچه دیدم» و «آنچه گرفتم» یکی می‌مانند.
   */
  rotations: ReadonlyMap<number, number>;
  onState: (state: PdfViewerHandle) => void;
}): JSX.Element {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<readonly { width: number; height: number }[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /*
    «برگهٔ جاری» یعنی برگه‌ای که **بیشتر** در دید است، نه هر برگه‌ای که آخرین بار
    رویداد داد.

    نسخهٔ اول هر برگهٔ دیده‌شده را برگهٔ جاری اعلام می‌کرد و ترتیب رویدادها تعیین
    می‌کرد کدام برنده شود؛ نتیجه‌اش این بود که کاربر دکمهٔ چرخش را می‌زد و برگهٔ
    **بعدی** می‌چرخید. آزمون E2E همین را گرفت.
  */
  const ratios = useRef(new Map<number, number>());
  const report = useCallback(
    (pageNumber: number, ratio: number, pageCount: number) => {
      ratios.current.set(pageNumber, ratio);

      let best = 1;
      let bestRatio = -1;
      for (const [page, value] of ratios.current) {
        // برابری‌ها به برگهٔ بالاتر می‌رسند؛ همان چیزی که چشم «جاری» می‌خواند.
        if (value > bestRatio + 0.01 || (Math.abs(value - bestRatio) <= 0.01 && page < best)) {
          best = page;
          bestRatio = value;
        }
      }

      onState({ pageCount, currentPage: best });
    },
    [onState],
  );

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;

    void (async () => {
      try {
        /*
          pdf.js بافر را «مصادره» می‌کند (detached ArrayBuffer) و فراخواننده دیگر
          نمی‌تواند از همان بایت‌ها برای دانلود استفاده کند. پس یک نسخه می‌گیریم.
        */
        const task = getDocument({ data: data.slice(0), ...PDF_ASSETS });
        loaded = await task.promise;
        if (cancelled) {
          void loaded.destroy();
          return;
        }

        /*
          اندازهٔ صفحه‌ها، **بدون رندر**: جای هر صفحه از همان اول درست است و نوار
          اسکرول پرش ندارد.

          دو نکته که از یک شکست واقعی آمدند:

           ۱. **دسته‌دسته، نه یک‌جا.** `Promise.all` روی یک فایل چندصد صفحه‌ای
              همان تعداد درخواست را با هم به worker می‌ریخت.
           ۲. **یک صفحهٔ خراب، کل فایل را نمی‌اندازد.** پیش از این اگر خواندن
              اندازهٔ یک صفحه شکست می‌خورد، `Promise.all` رد می‌شد و کاربر برای
              یک فایل سالمِ چندصد صفحه‌ای پیام «خواندن فایل ناموفق بود» می‌دید.
              حالا آن صفحه اندازهٔ پیش‌فرض A4 می‌گیرد و بقیه نشان داده می‌شوند.
        */
        const pageSizes: { width: number; height: number }[] = [];
        const BATCH = 20;

        for (let start = 0; start < loaded.numPages; start += BATCH) {
          if (cancelled) return;

          const slice = await Promise.all(
            Array.from({ length: Math.min(BATCH, loaded.numPages - start) }, async (_u, offset) => {
              try {
                const page = await (loaded as PDFDocumentProxy).getPage(start + offset + 1);
                const viewport = page.getViewport({ scale: 1 });
                return { width: viewport.width, height: viewport.height };
              } catch (error) {
                console.error('pdf.js size:', start + offset + 1, error);
                return A4;
              }
            }),
          );

          pageSizes.push(...slice);
        }

        if (cancelled) return;
        setDoc(loaded);
        setSizes(pageSizes);
      } catch (error) {
        // پیام خام در کنسول می‌ماند تا بشود دنبالش رفت؛ کاربر ترجمه‌اش را می‌بیند.
        console.error('pdf.js:', error);
        if (!cancelled) setFailure(describeFailure(error));
      }
    })();

    return () => {
      cancelled = true;
      if (loaded) void loaded.destroy();
    };
  }, [data]);

  if (failure !== null) {
    return (
      <ErrorState
        title="خواندن فایل PDF ناموفق بود"
        message={`${failure} فایل را دانلود کنید؛ رکورد آن در بایگانی سالم است.`}
      />
    );
  }

  if (!doc) return <LoadingState label="در حال خواندن فایل…" />;

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-4 p-4">
      {sizes.map((size, index) => (
        <PdfPage
          key={index}
          doc={doc}
          pageNumber={index + 1}
          size={size}
          scale={scale}
          rotation={rotations.get(index + 1) ?? 0}
          root={containerRef}
          onVisible={report}
        />
      ))}
    </div>
  );
}

/**
 * یک صفحه: جایش همیشه هست، بومش فقط وقتی نزدیک دید است.
 *
 * حاشیهٔ ۴۰۰ پیکسلی در `rootMargin` عمدی است: صفحه پیش از رسیدن به دید رندر
 * می‌شود، پس کاربر صفحهٔ خالی نمی‌بیند و اسکرول روان می‌ماند.
 */
function PdfPage({
  doc,
  pageNumber,
  size,
  scale,
  rotation,
  root,
  onVisible,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  size: { width: number; height: number };
  scale: number;
  rotation: number;
  root: React.RefObject<HTMLDivElement>;
  onVisible: (pageNumber: number, ratio: number, pageCount: number) => void;
}): JSX.Element {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(pageNumber <= 2);

  /*
    جای برگه هم با چرخش عوض می‌شود: یک A4 عمودی که ۹۰ درجه چرخیده، افقی است. اگر
    فقط بوم می‌چرخید و جایش نه، برگه از کادرش بیرون می‌زد و نوار اسکرول می‌پرید.
  */
  const quarterTurn = rotation === 90 || rotation === 270;
  const width = Math.round((quarterTurn ? size.height : size.width) * scale);
  const height = Math.round((quarterTurn ? size.width : size.height) * scale);

  useEffect(() => {
    const element = holderRef.current;
    if (!element) return undefined;

    const box = root.current?.parentElement ?? null;

    /*
      دو ناظر، چون دو پرسش متفاوت‌اند و حاشیه‌شان یکی نیست:

       - «نزدیک دید هست؟» با حاشیهٔ ۴۰۰ پیکسلی، تا برگه **پیش از** رسیدن به دید
         رندر شود و کاربر صفحهٔ خالی نبیند.
       - «چقدر در دید است؟» بدون حاشیه. با حاشیه، برگه‌ای که هنوز پایین‌تر از
         پنجره است نسبت ۱ می‌گرفت و «برگهٔ جاری» می‌شد — یعنی دکمهٔ چرخش روی
         برگه‌ای کار می‌کرد که کاربر اصلاً نمی‌دید.
    */
    const renderNear = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setNear(entry.isIntersecting);
      },
      { root: box, rootMargin: '400px 0px', threshold: 0 },
    );

    const inView = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        onVisible(pageNumber, entry.isIntersecting ? entry.intersectionRatio : 0, doc.numPages);
      },
      // پله‌های ریز: بدون آن‌ها نسبتِ دیده‌شدن فقط دو مقدار داشت و مقایسه بی‌معنا بود.
      { root: box, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    );

    renderNear.observe(element);
    inView.observe(element);
    return () => {
      renderNear.disconnect();
      inView.disconnect();
    };
  }, [root, onVisible, pageNumber, doc]);

  useEffect(() => {
    if (!near) return undefined;

    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    void (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      let page;
      try {
        page = await doc.getPage(pageNumber);
      } catch (error) {
        console.error('pdf.js page:', pageNumber, error);
        return;
      }
      if (cancelled) return;

      /*
        رندر با چگالی صفحه‌نمایش، تا متن روی نمایشگر رتینا تار نشود — ولی سقف‌دار،
        چون در زوم زیاد، بوم‌های بسیار بزرگ خودشان همان کندی‌ای را می‌سازند که
        این نمایشگر برای حذفش ساخته شده.
      */
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      // `rotation` در pdf.js **مطلق** است، پس چرخش ذاتی برگه را خودمان جمع می‌زنیم.
      const viewport = page.getViewport({
        scale: scale * ratio,
        rotation: (((page.rotate + rotation) % 360) + 360) % 360,
      });

      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);

      const context = canvas.getContext('2d');
      if (!context) return;

      const render = page.render({ canvasContext: context, viewport });
      task = render;
      try {
        await render.promise;
      } catch {
        // لغو رندر هنگام زوم یا دور شدن صفحه، خطا نیست.
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
      // بوم آزاد می‌شود تا حافظه با تعداد صفحه رشد نکند.
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [near, doc, pageNumber, scale, rotation]);

  return (
    <div
      ref={holderRef}
      data-page={pageNumber}
      style={{ width, height }}
      className="relative shrink-0 bg-white shadow-[var(--shadow-soft)]"
    >
      {near ? (
        <canvas ref={canvasRef} className="h-full w-full" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          صفحهٔ {toPersianDigits(String(pageNumber))}
        </span>
      )}
    </div>
  );
}
