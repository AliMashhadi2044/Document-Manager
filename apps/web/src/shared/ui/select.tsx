import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from './cn';
import { useAnchoredPosition } from './use-anchored-position';
import { Icon } from './icon';
import { CONTROL_CLASS, HELP_CLASS, LABEL_CLASS, borderClass } from './field';
import {
  applyOrder,
  loadPrefs,
  moveInGroup,
  optionMatches,
  savePrefs,
  splitPinned,
  togglePinned,
  type SelectPrefs,
} from './select-prefs';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
  /** خط دوم گزینه — مثل کد فصل یا نوع فاکتور. */
  readonly description?: string | undefined;
}

export interface SelectProps {
  label?: ReactNode;
  'aria-label'?: string;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string | undefined;
  hint?: ReactNode;
  options: readonly SelectOption[];
  /** متن گزینه خالی. اگر `null` باشد، کاربر نمی‌تواند انتخاب را پاک کند. */
  placeholder?: string | null;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /**
   * کلید ذخیره پین و ترتیب. اگر داده نشود از `label` یا `aria-label` ساخته می‌شود؛
   * `null` یعنی این فهرست ترجیح ذخیره نکند.
   */
  prefsKey?: string | null;
  emptyLabel?: string;
  /** `sm` برای ردیف‌های متراکم طراح گزارش؛ پیش‌فرض هم‌ارتفاع بقیه کنترل‌های فرم است. */
  size?: 'sm' | 'md';
  /**
   * جست‌وجوی سمت سرور برای فهرست‌های بلند (مدرسه، پلاک، فروشنده).
   *
   * اگر داده شود، این کامپوننت دیگر `options` را خودش فیلتر نمی‌کند — متن را بالا
   * می‌دهد و همان صفحه نتایجی که سرور داده را نشان می‌دهد. آوردن کل جدول به مرورگر
   * برای فیلتر محلی، الزام بهینگی را نقض می‌کند.
   */
  /**
   * ساخت گزینهٔ تازه، بدون خروج از همین فرم.
   *
   * چرا داخل خود فهرست: کاربر وقتی می‌فهمد گزینه‌اش نیست که فهرست را باز کرده و
   * جست‌وجو کرده است؛ فرستادنش به صفحهٔ اطلاعات پایه یعنی رها کردن سندِ نیمه‌تمام.
   */
  onCreate?: () => void;
  createLabel?: string;
  remoteSearch?: {
    readonly search: string;
    readonly onSearchChange: (search: string) => void;
    readonly loading?: boolean;
    readonly total?: number | undefined;
  };
}

/** از این تعداد به بالا، فهرست بلند حساب می‌شود و حالت مدیریت ترتیب هم معنا دارد. */
const MANAGE_MIN = 2;

/**
 * انتخاب از فهرست — یک `combobox` ساخته‌شده، نه `select` بومی.
 *
 * چرا `select` بومی کنار گذاشته شد:
 *
 *  ۱. **جست‌وجو.** فهرست بومی جست‌وجو ندارد؛ در فهرست مدرسه یا فصل، کاربر باید
 *     با اسکرول پیدا کند. جست‌وجو اینجا متن فارسی را یکدست می‌کند (ی/ي، ک/ك،
 *     ارقام فارسی و عربی)، پس «1405» و «۱۴۰۵» یک نتیجه می‌دهند.
 *  ۲. **پین و ترتیب دلخواه.** کاربری که هر روز سه فصل از بیست فصل را می‌زند،
 *     باید آن سه را بالا داشته باشد. این ترجیح مالِ کاربر است، پس در مرورگر او
 *     ذخیره می‌شود و روی داده سرور اثری ندارد.
 *  ۳. **یکدستی ظاهر.** فلش و فهرست `select` بومی را نمی‌شود استایل داد؛ در تم
 *     تاریک، فهرست بازشده همان خاکستری سیستم می‌ماند.
 *
 * چیزی که عمداً نگه داشته شد: یک `select` واقعی و پنهان در DOM می‌ماند تا
 * `required` و `name` و اعتبارسنجی بومیِ فرم کار کند. بدون آن، فرمی که با
 * `required` جلوی ارسال را می‌گرفت، بی‌صدا ارسال می‌شد.
 *
 * دسترس‌پذیری: پین و جابه‌جایی در «حالت مدیریت» دکمه دارند و در حالت انتخاب با
 * `Alt+P` و `Alt+↑/↓` انجام می‌شوند. دکمه‌ی تعاملی **درون** `role="option"`
 * گذاشته نشد؛ آن کار درخت دسترس‌پذیری فهرست را خراب می‌کند.
 */
export function Select({
  className,
  label,
  'aria-label': ariaLabel,
  error,
  hint,
  options,
  placeholder = 'انتخاب کنید…',
  value,
  onChange,
  id,
  name,
  required,
  disabled = false,
  prefsKey,
  emptyLabel = 'موردی یافت نشد',
  size = 'md',
  onCreate,
  createLabel,
  remoteSearch,
}: SelectProps): JSX.Element {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const listId = `${controlId}-list`;
  const errorId = `${controlId}-error`;
  const hintId = `${controlId}-hint`;

  const storageKey = useMemo(() => {
    if (prefsKey !== undefined) return prefsKey;
    if (typeof label === 'string' && label !== '') return label;
    return ariaLabel ?? null;
  }, [prefsKey, label, ariaLabel]);

  const [prefs, setPrefs] = useState<SelectPrefs>(() => loadPrefs(storageKey));
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [localQuery, setLocalQuery] = useState('');
  const query = remoteSearch ? remoteSearch.search : localQuery;
  const setQuery = remoteSearch ? remoteSearch.onSearchChange : setLocalQuery;
  const [activeIndex, setActiveIndex] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const updatePrefs = useCallback(
    (next: SelectPrefs) => {
      setPrefs(next);
      savePrefs(storageKey, next);
    },
    [storageKey],
  );

  const selected = options.find((option) => option.value === value);

  /**
   * عنوان انتخاب جاری، مستقل از صفحهٔ نتایج.
   *
   * در فهرست سمت‌سرور، پس از انتخاب و جست‌وجوی دوباره، گزینهٔ انتخاب‌شده دیگر در
   * `options` نیست؛ بدون این حافظه، کنترل خالی به نظر می‌رسد در حالی که مقدار دارد.
   */
  const [rememberedLabel, setRememberedLabel] = useState<string | null>(null);
  const resolvedLabel = selected?.label ?? (value === '' ? null : rememberedLabel);

  useEffect(() => {
    if (selected) setRememberedLabel(selected.label);
    else if (value === '') setRememberedLabel(null);
  }, [selected, value]);
  const hasError = Boolean(error);
  const canManage = storageKey !== null && options.length >= MANAGE_MIN;

  // ───── چیدمان گزینه‌ها: ترتیب دلخواه، سپس جدا کردن پین‌شده‌ها، سپس جست‌وجو ─────
  const arranged = useMemo(() => applyOrder(options, prefs.order), [options, prefs.order]);
  const groups = useMemo(
    () =>
      splitPinned(arranged, prefs.pinned, (missing): SelectOption | null => {
        const label = prefs.labels[missing];
        return label === undefined ? null : { value: missing, label };
      }),
    [arranged, prefs.pinned, prefs.labels],
  );

  const filtered = useMemo(
    () => ({
      // پین‌شده‌ها عنوانشان محلی است، پس حتی در حالت سروری هم محلی فیلتر می‌شوند.
      pinned: groups.pinned.filter((option) => optionMatches(option, query)),
      rest: remoteSearch
        ? groups.rest
        : groups.rest.filter((option) => optionMatches(option, query)),
    }),
    [groups, query, remoteSearch],
  );

  const showClearRow = placeholder !== null && query === '' && !manage;
  const flat = useMemo(
    () => [...filtered.pinned, ...filtered.rest],
    [filtered.pinned, filtered.rest],
  );
  /** اندیس ۰ به گزینه «پاک کردن» می‌رسد، اگر نشان داده شود. */
  const rowIndex = (position: number): number => position + (showClearRow ? 1 : 0);
  const totalRows = flat.length + (showClearRow ? 1 : 0);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      setManage(false);
      setQuery('');
      if (returnFocus) triggerRef.current?.focus();
    },
    // setQuery در حالت سروری از بیرون می‌آید و می‌تواند عوض شود.
    [setQuery],
  );

  // بستن با کلیک بیرون. panel در پورتال است، پس «بیرون» باید هر دو را بسنجد.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, close]);

  // فوکوس به جست‌وجو پس از باز شدن — وگرنه کاربر کیبورد باید Tab بزند.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  /**
   * ظرف پورتال: گفت‌وگوی پوشای دربرگیرنده، وگرنه بدنه سند.
   *
   * پیش از باز شدن، دکمه هنوز ممکن است در DOM نباشد؛ این مقدار در همان رندری که
   * فهرست باز می‌شود خوانده می‌شود.
   */
  const container =
    open && triggerRef.current
      ? (triggerRef.current.closest('dialog') ?? document.body)
      : document.body;

  const position = useAnchoredPosition(triggerRef, open, container);

  const commit = (option: SelectOption): void => {
    if (option.disabled) return;
    onChange(option.value);
    close(true);
  };

  const togglePin = (option: SelectOption): void => {
    updatePrefs({
      ...prefs,
      pinned: togglePinned(prefs.pinned, option.value),
      labels: { ...prefs.labels, [option.value]: option.label },
    });
  };

  const move = (option: SelectOption, direction: -1 | 1): void => {
    const isPinned = prefs.pinned.includes(option.value);
    const group = (isPinned ? groups.pinned : groups.rest).map((item) => item.value);
    const order = moveInGroup(
      arranged.map((item) => item.value),
      group,
      option.value,
      direction,
    );

    if (isPinned) {
      // ترتیب پین‌شده‌ها از خودِ `pinned` می‌آید، پس همان باید جابه‌جا شود.
      updatePrefs({ ...prefs, pinned: moveInGroup(prefs.pinned, group, option.value, direction) });
      return;
    }
    updatePrefs({ ...prefs, order });
  };

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    const active = flat[activeIndex - (showClearRow ? 1 : 0)];

    if (event.altKey && active && canManage) {
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        togglePin(active);
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        move(active, event.key === 'ArrowUp' ? -1 : 1);
        return;
      }
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, Math.max(totalRows - 1, 0)));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(Math.max(totalRows - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        if (manage) break;
        if (showClearRow && activeIndex === 0) {
          onChange('');
          close(true);
          break;
        }
        if (active) commit(active);
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        break;
    }
  };

  const triggerLabel = resolvedLabel ?? (placeholder === null ? '' : placeholder);

  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={controlId} className={LABEL_CLASS}>
          {label}
          {required ? (
            <span className="text-destructive ms-1" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      <div className="relative">
        {/*
          select بومی و پنهان: نگهدار اعتبارسنجی فرم و `name`.
          با اندازه یک پیکسل و شفافیت صفر پنهان شده و نه با `display:none` — مرورگر
          کنترلِ display:none را نه اعتبارسنجی می‌کند و نه می‌تواند فوکوس کند.
        */}
        <select
          id={`${controlId}-native`}
          name={name}
          required={required}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 start-0 size-px opacity-0"
        >
          <option value="" />
          {options.map((option) => (
            <option key={option.value} value={option.value} />
          ))}
        </select>

        <button
          ref={triggerRef}
          type="button"
          id={controlId}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-label={ariaLabel}
          aria-invalid={hasError ? true : undefined}
          aria-required={required ? true : undefined}
          aria-describedby={
            cn(hasError ? errorId : undefined, hint ? hintId : undefined) || undefined
          }
          disabled={disabled}
          onClick={() => (open ? close(false) : setOpen(true))}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            size === 'sm'
              ? 'flex h-8 w-full items-center justify-between gap-1.5 rounded-md border bg-card px-2 text-xs transition-colors hover:border-muted-foreground/40 disabled:cursor-not-allowed disabled:opacity-60'
              : cn(CONTROL_CLASS, 'flex items-center justify-between gap-2 text-start'),
            borderClass(hasError),
            open && 'border-primary ring-2 ring-primary/20',
            className,
          )}
        >
          <span className={cn('truncate', resolvedLabel === null ? 'text-muted-foreground' : '')}>
            {triggerLabel}
          </span>
          <Icon
            name="chevron-down"
            size={size === 'sm' ? 14 : 16}
            className={cn(
              'shrink-0 text-muted-foreground transition-transform duration-150',
              open && '-rotate-180',
            )}
          />
        </button>
      </div>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              style={position}
              className={cn(
                'z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-popover',
                'shadow-[var(--shadow-lift)] animate-[var(--animate-pop)]',
              )}
            >
              <div className="border-b border-border p-2">
                <div className="relative">
                  <Icon
                    name="search"
                    size={15}
                    className="pointer-events-none absolute inset-y-0 start-2.5 my-auto text-muted-foreground"
                  />
                  <input
                    ref={searchRef}
                    type="text"
                    dir="rtl"
                    autoComplete="off"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={onSearchKeyDown}
                    aria-label={`جست‌وجو در ${
                      typeof label === 'string' && label !== '' ? label : (ariaLabel ?? 'گزینه‌ها')
                    }`}
                    aria-controls={listId}
                    aria-activedescendant={
                      !manage && totalRows > 0 ? `${listId}-${activeIndex}` : undefined
                    }
                    placeholder="جست‌وجو…"
                    className="h-9 w-full rounded-lg border border-input bg-card ps-8 pe-3 text-sm placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              {manage ? (
                <ManageList
                  id={listId}
                  groups={filtered}
                  pinnedValues={prefs.pinned}
                  emptyLabel={emptyLabel}
                  onTogglePin={togglePin}
                  onMove={move}
                />
              ) : (
                <div
                  id={listId}
                  role="listbox"
                  aria-label={
                    typeof label === 'string' && label !== ''
                      ? label
                      : (ariaLabel ?? 'فهرست گزینه‌ها')
                  }
                  className="max-h-64 overflow-y-auto p-1"
                >
                  {showClearRow ? (
                    <Row
                      id={`${listId}-0`}
                      active={activeIndex === 0}
                      selected={value === ''}
                      muted
                      label={placeholder}
                      onHover={() => setActiveIndex(0)}
                      onPick={() => {
                        onChange('');
                        close(true);
                      }}
                    />
                  ) : null}

                  {filtered.pinned.length > 0 ? (
                    <div role="group" aria-label="پین‌شده">
                      <GroupTitle>پین‌شده</GroupTitle>
                      {filtered.pinned.map((option, index) => (
                        <Row
                          key={option.value}
                          id={`${listId}-${rowIndex(index)}`}
                          active={activeIndex === rowIndex(index)}
                          selected={option.value === value}
                          disabled={option.disabled}
                          pinned
                          label={option.label}
                          description={option.description}
                          onHover={() => setActiveIndex(rowIndex(index))}
                          onPick={() => commit(option)}
                        />
                      ))}
                    </div>
                  ) : null}

                  {filtered.rest.length > 0 ? (
                    <div role="group" aria-label="گزینه‌ها">
                      {filtered.pinned.length > 0 ? <GroupTitle>بقیه</GroupTitle> : null}
                      {filtered.rest.map((option, index) => {
                        const at = rowIndex(filtered.pinned.length + index);
                        return (
                          <Row
                            key={option.value}
                            id={`${listId}-${at}`}
                            active={activeIndex === at}
                            selected={option.value === value}
                            disabled={option.disabled}
                            label={option.label}
                            description={option.description}
                            onHover={() => setActiveIndex(at)}
                            onPick={() => commit(option)}
                          />
                        );
                      })}
                    </div>
                  ) : null}

                  {remoteSearch?.loading === true && flat.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      در حال جست‌وجو…
                    </p>
                  ) : flat.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {emptyLabel}
                    </p>
                  ) : null}

                  {remoteSearch?.total !== undefined &&
                  remoteSearch.total > filtered.rest.length ? (
                    <p className="mt-1 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      نتایج بیشتری وجود دارد؛ جست‌وجو را دقیق‌تر کنید.
                    </p>
                  ) : null}
                </div>
              )}

              {onCreate ? (
                <div className="border-t border-border p-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      close(false);
                      onCreate();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    <Icon name="plus" size={14} />
                    {createLabel ?? 'افزودن مورد تازه'}
                  </button>
                </div>
              ) : null}

              {canManage ? (
                <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 p-1.5">
                  <button
                    type="button"
                    onClick={() => setManage((state) => !state)}
                    aria-pressed={manage}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors',
                      manage
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon name="sliders" size={14} />
                    {manage ? 'پایان ترتیب‌دهی' : 'پین و ترتیب'}
                  </button>

                  {prefs.pinned.length > 0 || prefs.order.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => updatePrefs({ pinned: [], order: [], labels: {} })}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Icon name="restore" size={14} />
                      بازنشانی
                    </button>
                  ) : (
                    <span className="pe-1 text-[11px] text-muted-foreground">
                      Alt+P پین، Alt+↑↓ جابه‌جایی
                    </span>
                  )}
                </div>
              ) : null}
            </div>,
            // ظرف پورتال: اگر کنترل درون یک dialog پوشاست، فهرست هم باید همانجا باشد.
            //
            // «dialog»ی که با showModal باز شده در لایه بالای مرورگر نقاشی می‌شود؛ هیچ z-indexی
            // عنصری را که در body مانده بالاتر از آن نمی‌برد — فهرست زیر گفت‌وگو پنهان می‌شد.
            container,
          )
        : null}

      {hint && !error ? (
        <p id={hintId} className={cn(HELP_CLASS, 'text-muted-foreground')}>
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className={cn(HELP_CLASS, 'text-destructive')}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function GroupTitle({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p aria-hidden="true" className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
      {children}
    </p>
  );
}

/** یک ردیف در حالت انتخاب — بدون هیچ عنصر تعاملیِ تودرتو. */
function Row({
  id,
  label,
  description,
  active,
  selected,
  disabled = false,
  pinned = false,
  muted = false,
  onHover,
  onPick,
}: {
  id: string;
  label: string;
  description?: string | undefined;
  active: boolean;
  selected: boolean;
  disabled?: boolean | undefined;
  pinned?: boolean;
  muted?: boolean;
  onHover: () => void;
  onPick: () => void;
}): JSX.Element {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled ? true : undefined}
      onMouseEnter={onHover}
      // mousedown، نه click: تا رفتن فوکوس از جست‌وجو، فهرست را پیش از انتخاب نبندد.
      onMouseDown={(event) => {
        event.preventDefault();
        if (!disabled) onPick();
      }}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm',
        active ? 'bg-muted' : '',
        selected ? 'font-medium text-primary' : muted ? 'text-muted-foreground' : 'text-foreground',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      )}
    >
      <Icon
        name="check"
        size={15}
        className={cn('shrink-0 text-primary', selected ? '' : 'invisible')}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {description ? (
          <span className="block truncate text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
      {pinned ? (
        <Icon name="pin" size={13} className="shrink-0 text-muted-foreground/70" />
      ) : null}
    </div>
  );
}

/**
 * حالت مدیریت: پین کردن و جابه‌جایی.
 *
 * این حالت جداست چون دکمه درون `role="option"` مجاز نیست؛ در حالت انتخاب، فهرست
 * یک `listbox` تمیز می‌ماند و در این حالت یک فهرست معمولی با دکمه‌های نام‌دار.
 */
function ManageList({
  id,
  groups,
  pinnedValues,
  emptyLabel,
  onTogglePin,
  onMove,
}: {
  id: string;
  groups: { pinned: SelectOption[]; rest: SelectOption[] };
  pinnedValues: readonly string[];
  emptyLabel: string;
  onTogglePin: (option: SelectOption) => void;
  onMove: (option: SelectOption, direction: -1 | 1) => void;
}): JSX.Element {
  const rows = [...groups.pinned, ...groups.rest];

  return (
    <ul id={id} className="max-h-64 overflow-y-auto p-1">
      {rows.length === 0 ? (
        <li className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</li>
      ) : null}

      {rows.map((option, index) => {
        const isPinned = pinnedValues.includes(option.value);
        const group = isPinned ? groups.pinned : groups.rest;
        const positionInGroup = group.findIndex((item) => item.value === option.value);

        return (
          <li
            key={option.value}
            className={cn(
              'flex items-center gap-1 rounded-lg px-1.5 py-1',
              isPinned ? 'bg-primary/5' : '',
              index === groups.pinned.length - 1 && groups.rest.length > 0
                ? 'mb-1 border-b border-border pb-2'
                : '',
            )}
          >
            <span className="min-w-0 flex-1 truncate text-sm">{option.label}</span>

            <ManageButton
              label={`${isPinned ? 'برداشتن پین' : 'پین کردن'} ${option.label}`}
              icon={isPinned ? 'pin-off' : 'pin'}
              pressed={isPinned}
              onClick={() => onTogglePin(option)}
            />
            <ManageButton
              label={`انتقال به بالا: ${option.label}`}
              icon="arrow-up"
              disabled={positionInGroup <= 0}
              onClick={() => onMove(option, -1)}
            />
            <ManageButton
              label={`انتقال به پایین: ${option.label}`}
              icon="arrow-down"
              disabled={positionInGroup < 0 || positionInGroup >= group.length - 1}
              onClick={() => onMove(option, 1)}
            />
          </li>
        );
      })}
    </ul>
  );
}

function ManageButton({
  label,
  icon,
  onClick,
  disabled = false,
  pressed,
}: {
  label: string;
  icon: 'pin' | 'pin-off' | 'arrow-up' | 'arrow-down';
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-all duration-150',
        'hover:bg-muted active:scale-90 disabled:cursor-not-allowed disabled:opacity-30',
        pressed ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}
