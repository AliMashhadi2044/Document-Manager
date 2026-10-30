import { useState } from 'react';
import { PASSWORD_POLICY_HINT, ROLE_KEYS, ROLE_LABELS, type RoleKey } from '@dm/shared';

import { ApiError } from '../../shared/api/client';
import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Modal } from '../../shared/ui/modal';
import { Toggle } from '../../shared/ui/toggle';
import { formatServerMessage } from '../../shared/format/money';
import { useCreateUser, useResetPassword, useUpdateUser, type UserRow } from './users.api';

/**
 * ساخت و اصلاح کاربر.
 *
 * یک پنجره برای هر دو کار، با یک تفاوت عمدی: **نام کاربری و رمز فقط در ساخت**
 * هستند. نام کاربری هویت کاربر در لاگ و حسابرسی است و عوض شدنش ردپای او را
 * دونیم می‌کند؛ رمز هم مسیر جدای خودش را دارد، چون بازنشانی‌اش نشست‌ها را
 * می‌بندد و این کاری نیست که کنار اصلاح نام اتفاق بیفتد.
 */
export function UserDialog({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  /** `null` یعنی ساخت کاربر تازه. */
  user: UserRow | null;
  /** حساب خودِ بیننده — نقش و وضعیتش از اینجا عوض نمی‌شود (سرور هم رد می‌کند). */
  isSelf: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}): JSX.Element {
  const create = useCreateUser();
  const update = useUpdateUser();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [roles, setRoles] = useState<readonly RoleKey[]>(user?.roles ?? []);
  const [error, setError] = useState<string | null>(null);

  const isNew = user === null;
  const saving = create.isPending || update.isPending;

  const toggleRole = (role: RoleKey): void =>
    setRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );

  function submit(): void {
    setError(null);

    if (roles.length === 0) {
      setError('دست‌کم یک نقش انتخاب کنید.');
      return;
    }

    const onError = (caught: unknown): void =>
      setError(
        caught instanceof ApiError ? formatServerMessage(caught.message) : 'ذخیره ناموفق بود',
      );

    if (isNew) {
      create.mutate(
        { username: username.trim(), fullName: fullName.trim(), password, roles, isActive },
        {
          onSuccess: (created) => onSaved(`کاربر «${created.username}» ساخته شد.`),
          onError,
        },
      );
      return;
    }

    update.mutate(
      {
        id: user.id,
        fullName: fullName.trim(),
        // حساب خودِ بیننده: نقش و وضعیت فرستاده نمی‌شوند تا خطای سرور نگیرد.
        ...(isSelf ? {} : { isActive, roles }),
      },
      { onSuccess: () => onSaved('کاربر اصلاح شد.'), onError },
    );
  }

  return (
    <Modal title={isNew ? 'کاربر تازه' : `اصلاح ${user.username}`} onClose={onClose}>
      <div className="space-y-4 p-4">
        {isNew ? (
          <Input
            label="نام کاربری"
            required
            dir="ltr"
            autoComplete="off"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            hint="حروف لاتین، رقم، نقطه، خط تیره و زیرخط — بعداً عوض نمی‌شود."
          />
        ) : null}

        <Input
          label="نام و نام خانوادگی"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />

        {isNew ? (
          <Input
            label="رمز عبور"
            required
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint={PASSWORD_POLICY_HINT}
          />
        ) : null}

        <fieldset>
          <legend className="mb-2 text-xs font-medium">نقش‌ها</legend>
          <div className="flex flex-wrap gap-1.5">
            {ROLE_KEYS.map((role) => {
              const selected = roles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  aria-pressed={selected}
                  disabled={isSelf && !isNew}
                  onClick={() => toggleRole(role)}
                  className={
                    selected
                      ? 'rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs text-primary disabled:opacity-60'
                      : 'rounded-full border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-60'
                  }
                >
                  {ROLE_LABELS[role]}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {isSelf && !isNew
              ? 'نقش‌های حساب خودتان از اینجا عوض نمی‌شود؛ از مدیر سامانهٔ دیگری بخواهید.'
              : 'دسترسی واقعی از دسترسی‌های همین نقش‌ها می‌آید و در هر درخواست سمت سرور بررسی می‌شود.'}
          </p>
        </fieldset>

        {isSelf && !isNew ? null : (
          <Toggle checked={isActive} onChange={setIsActive} label="حساب فعال است" />
        )}

        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button loading={saving} onClick={submit}>
            ذخیره
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** بازنشانی رمز توسط مدیر — رمز قدیمی لازم نیست و نشست‌ها بسته می‌شوند. */
export function PasswordDialog({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}): JSX.Element {
  const reset = useResetPassword();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title={`بازنشانی رمز ${user.username}`} onClose={onClose}>
      <div className="space-y-4 p-4">
        <p className="rounded-md bg-muted p-2.5 text-xs leading-5 text-muted-foreground">
          رمز تازه را به کاربر بدهید و از او بخواهید عوضش کند. با این کار همهٔ نشست‌های باز
          او بسته می‌شود — نشست به رمز گره نخورده است و بدون بستن، نشستِ باز با رمز قدیمی
          کار می‌کرد.
        </p>

        <Input
          label="رمز تازه"
          required
          type="password"
          dir="ltr"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint={PASSWORD_POLICY_HINT}
        />
        <Input
          label="تکرار رمز تازه"
          required
          type="password"
          dir="ltr"
          autoComplete="new-password"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
        />

        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button
            loading={reset.isPending}
            onClick={() => {
              setError(null);
              if (password !== repeat) {
                setError('دو رمز یکسان نیستند.');
                return;
              }
              reset.mutate(
                { id: user.id, password },
                {
                  onSuccess: () => onSaved('رمز عوض شد و نشست‌های باز بسته شدند.'),
                  onError: (caught) =>
                    setError(
                      caught instanceof ApiError
                        ? formatServerMessage(caught.message)
                        : 'بازنشانی رمز ناموفق بود',
                    ),
                },
              );
            }}
          >
            بازنشانی رمز
          </Button>
        </div>
      </div>
    </Modal>
  );
}
