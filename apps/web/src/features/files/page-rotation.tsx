import { useCallback, useEffect, useRef, useState } from 'react';
import { nextRotation } from '@dm/shared';

import { Icon } from '../../shared/ui/icon';
import { toPersianDigits } from '../../shared/format/money';
import type { PageRotationRow } from './files.api';

/**
 * چرخش برگه‌ها: حالت محلی، ذخیرهٔ تأخیری روی سرور.
 *
 * ─────── چرا تأخیری ───────
 *
 * کاربر برای صاف کردن یک برگه گاهی سه بار پشت‌هم می‌زند. اگر هر کلیک یک درخواست
 * می‌فرستاد، سه درخواست در پرواز بودند و ترتیب رسیدنشان تضمینی نبود — یعنی ممکن
 * بود حالت ذخیره‌شده با آنچه روی صفحه است یکی نباشد. با مکث کوتاه، فقط حالت نهایی
 * فرستاده می‌شود.
 *
 * ─────── چرا «همهٔ حالت» و نه «تغییر» ───────
 *
 * هر بار **تمام** فهرست فرستاده می‌شود. یک درخواست گم‌شده با این شکل فقط یعنی
 * «ذخیره عقب ماند»، و درخواست بعدی همه‌چیز را درست می‌کند؛ با تغییرِ تکی، یک
 * درخواست گم‌شده حالتی می‌ساخت که هیچ‌کس نمی‌توانست بگوید درست است یا نه.
 */

const SAVE_DELAY_MS = 700;

export interface RotationState {
  readonly map: ReadonlyMap<number, number>;
  readonly turn: (page: number, direction: 1 | -1) => void;
  readonly turnAll: (pageCount: number, direction: 1 | -1) => void;
  readonly reset: () => void;
}

export function useRotations(
  saved: readonly PageRotationRow[] | null,
  save: (rotations: readonly PageRotationRow[]) => void,
): RotationState {
  const [map, setMap] = useState<ReadonlyMap<number, number>>(new Map());
  const loaded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // حالت ذخیره‌شده فقط **یک بار** روی حالت محلی می‌نشیند؛ وگرنه هر پاسخ سرور
  // می‌توانست چرخشی را که کاربر همین الان زده پس بگیرد.
  useEffect(() => {
    if (loaded.current || saved === null) return;
    loaded.current = true;
    setMap(new Map(saved.map((row) => [row.page, row.rotation])));
  }, [saved]);

  /*
    ذخیرهٔ معلق، هنگام بسته شدن نمایشگر **فرستاده** می‌شود و نه دور ریخته.

    نسخهٔ اول فقط تایمر را پاک می‌کرد و آزمون E2E همان را گرفت: کاربری که برگه را
    می‌چرخاند و بلافاصله پنجره را می‌بندد — کار کاملاً طبیعی — چرخشش را از دست
    می‌داد، بی‌آنکه چیزی به او بگوید.
  */
  const pending = useRef<readonly PageRotationRow[] | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (next) save(next);
  }, [save]);

  const schedule = useCallback(
    (next: ReadonlyMap<number, number>) => {
      pending.current = [...next.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([page, rotation]) => ({ page, rotation }));

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  // `flush` به `save` وابسته است و `save` با هر رندر تازه می‌شود؛ پس آخرین نسخه‌اش
  // در یک ref می‌ماند تا پاک‌سازی هنگام unmount همان را صدا بزند و نه نسخهٔ کهنه.
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(
    () => () => {
      flushRef.current();
    },
    [],
  );

  const apply = useCallback(
    (change: (current: ReadonlyMap<number, number>) => Map<number, number>) => {
      setMap((current) => {
        const next = change(current);
        schedule(next);
        return next;
      });
    },
    [schedule],
  );

  const turn = useCallback(
    (page: number, direction: 1 | -1) => {
      apply((current) => {
        const next = new Map(current);
        const value = nextRotation(current.get(page) ?? 0, direction);
        // «بدون چرخش» یعنی نبودِ کلید، نه صفر — همان قراردادی که سرور دارد.
        if (value === 0) next.delete(page);
        else next.set(page, value);
        return next;
      });
    },
    [apply],
  );

  const turnAll = useCallback(
    (pageCount: number, direction: 1 | -1) => {
      apply((current) => {
        const next = new Map<number, number>();
        for (let page = 1; page <= pageCount; page += 1) {
          const value = nextRotation(current.get(page) ?? 0, direction);
          if (value !== 0) next.set(page, value);
        }
        return next;
      });
    },
    [apply],
  );

  const reset = useCallback(() => apply(() => new Map()), [apply]);

  return { map, turn, turnAll, reset };
}

export function RotationControls({
  state,
  currentPage,
  pageCount,
  saving,
  failed,
}: {
  state: RotationState;
  currentPage: number;
  pageCount: number;
  saving: boolean;
  failed: boolean;
}): JSX.Element {
  const [allPages, setAllPages] = useState(false);

  const turn = (direction: 1 | -1): void => {
    if (allPages && pageCount > 0) state.turnAll(pageCount, direction);
    else state.turn(currentPage, direction);
  };

  return (
    <div className="flex items-center gap-1.5 border-e border-border pe-2 me-1">
      <RotateButton
        icon="rotate-ccw"
        label={allPages ? 'چرخش همهٔ برگه‌ها به چپ' : `چرخش برگهٔ ${currentPage} به چپ`}
        onClick={() => turn(-1)}
      />
      <RotateButton
        icon="rotate-cw"
        label={allPages ? 'چرخش همهٔ برگه‌ها به راست' : `چرخش برگهٔ ${currentPage} به راست`}
        onClick={() => turn(1)}
      />

      <button
        type="button"
        aria-pressed={allPages}
        onClick={() => setAllPages((current) => !current)}
        title="چرخش روی همهٔ برگه‌ها اعمال شود"
        className={
          allPages
            ? 'h-8 rounded-lg border border-primary bg-primary/10 px-2 text-xs text-primary'
            : 'h-8 rounded-lg border border-border px-2 text-xs hover:bg-muted'
        }
      >
        همهٔ برگه‌ها
      </button>

      {state.map.size > 0 ? (
        <button
          type="button"
          onClick={state.reset}
          title="بازگرداندن همهٔ برگه‌ها به حالت اصلی فایل"
          className="h-8 rounded-lg border border-border px-2 text-xs hover:bg-muted"
        >
          حالت اصلی
        </button>
      ) : null}

      {/*
        وضعیت ذخیره دیده می‌شود، چون چرخش روی فایلی اثر می‌گذارد که بقیه دانلود
        می‌کنند؛ «ذخیره شد یا نه» را نباید حدس زد.
      */}
      <span
        aria-live="polite"
        className={`money text-xs ${failed ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {failed
          ? 'ذخیرهٔ چرخش ناموفق بود'
          : saving
            ? 'در حال ذخیره…'
            : state.map.size > 0
              ? `${toPersianDigits(String(state.map.size))} برگهٔ چرخیده`
              : ''}
      </span>
    </div>
  );
}

function RotateButton({
  icon,
  label,
  onClick,
}: {
  icon: 'rotate-cw' | 'rotate-ccw';
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-90"
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
