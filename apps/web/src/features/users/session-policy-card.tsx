import { useEffect, useState } from 'react';
import {
  SESSION_IDLE_MAX_MINUTES,
  SESSION_IDLE_MIN_MINUTES,
  parseSessionPolicy,
  type SessionPolicy,
} from '@dm/shared';

import { ApiError } from '../../shared/api/client';
import { Button } from '../../shared/ui/button';
import { Card, CardBody, CardHeader } from '../../shared/ui/card';
import { Input } from '../../shared/ui/input';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useSessionPolicy, useSetSessionPolicy } from '../auth/auth.api';

/**
 * مهلت بی‌تحرکی نشست.
 *
 * تا پیش از این، این عدد فقط در متغیر محیطی سرور بود؛ یعنی «کاربر بعد از چند
 * دقیقه بی‌کاری بیرون انداخته شود» به دسترسی سرور و راه‌اندازی دوباره نیاز داشت.
 *
 * خالی گذاشتن کادر یعنی «پیش‌فرض سرور» و نه «بی‌نهایت» — مهلت هرگز برداشته
 * نمی‌شود، چون یک کنترل امنیتی است (docs/10-security-plan.md). سقف مطلق نشست هم
 * جداگانه سر جایش است: این عدد آن را بلندتر نمی‌کند.
 */
export function SessionPolicyCard(): JSX.Element {
  const query = useSessionPolicy(true);
  const save = useSetSessionPolicy();

  const [draft, setDraft] = useState<SessionPolicy | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // پاسخ سرور خوانده می‌شود نه باور؛ سرویس قدیمی‌تر می‌تواند این کلید را نفرستد.
  useEffect(() => {
    if (query.data) setDraft(parseSessionPolicy(query.data.policy));
  }, [query.data]);

  if (query.isError) {
    return <ErrorState message="خواندن سیاست نشست ناموفق بود." onRetry={() => void query.refetch()} />;
  }
  if (!query.data || !draft) return <LoadingState />;

  const envMinutes = query.data.envIdleMinutes;
  /*
    عددِ «حاکم» از پاسخ سرور می‌آید و نه از پیش‌نویس فرم.

    وگرنه همان لحظه که کاربر عدد را تایپ می‌کرد، صفحه می‌گفت «اکنون حاکم است» —
    در حالی که هیچ چیز ذخیره نشده بود.
  */
  const effective = query.data.effectiveIdleMinutes;
  const dirty = draft.idleMinutes !== query.data.policy.idleMinutes;
  const invalid =
    draft.idleMinutes !== null &&
    (draft.idleMinutes < SESSION_IDLE_MIN_MINUTES || draft.idleMinutes > SESSION_IDLE_MAX_MINUTES);

  return (
    <Card>
      <CardHeader
        icon="clock"
        title="مهلت بی‌تحرکی نشست"
        description="کاربری که این مدت هیچ کاری نکند، از سامانه بیرون انداخته می‌شود و باید دوباره وارد شود."
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="مهلت (دقیقه)"
            dir="ltr"
            inputMode="numeric"
            className="max-w-44"
            value={draft.idleMinutes === null ? '' : String(draft.idleMinutes)}
            onChange={(event) => {
              setMessage(null);
              const text = event.target.value.replace(/\D/gu, '');
              setDraft({ ...draft, idleMinutes: text === '' ? null : Number(text) });
            }}
            error={invalid ? `عددی بین ${SESSION_IDLE_MIN_MINUTES} و ${SESSION_IDLE_MAX_MINUTES} دقیقه` : undefined}
            hint={`خالی یعنی پیش‌فرض سرور (${toPersianDigits(String(envMinutes))} دقیقه).`}
          />

          <Button
            loading={save.isPending}
            disabled={invalid}
            onClick={() => {
              setError(null);
              setMessage(null);
              void save.mutateAsync(draft).then(
                () => setMessage('مهلت بی‌تحرکی ذخیره شد و از همین حالا اعمال می‌شود.'),
                (failure: unknown) =>
                  setError(
                    failure instanceof ApiError
                      ? formatServerMessage(failure.message)
                      : 'ذخیره ناموفق بود',
                  ),
              );
            }}
          >
            ذخیره
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          {dirty ? 'تغییر ذخیره نشده؛ مقدار حاکم همچنان' : 'مقدار حاکم در این لحظه:'}{' '}
          <span className="font-medium text-foreground">
            {toPersianDigits(String(effective))} دقیقه
          </span>
          . رابط کاربری چند دقیقه پیش از پایان نشست هشدار می‌دهد، تا کار نیمه‌تمام از دست نرود.
        </p>

        {message ? (
          <p role="status" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
