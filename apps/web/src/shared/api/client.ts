/**
 * کلاینت API.
 *
 * نکته‌های قراردادی (docs/01-architecture.md §۷):
 *  - هویت از **کوکی نشست** می‌آید؛ هیچ توکنی در JavaScript نگهداری نمی‌شود.
 *  - متدهای غیرامن باید هدر CSRF را از کوکی قابل‌خواندن بفرستند.
 *  - مبالغ به‌صورت **رشته عددی** منتقل می‌شوند؛ تبدیل به `bigint` در لایه schema.
 */

export const API_BASE = '/api/v1';
const CSRF_COOKIE = 'dm_csrf';
const CSRF_HEADER = 'x-csrf-token';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface ApiErrorDetail {
  readonly path: string;
  readonly message: string;
}

/** خطای ساختاریافته‌ای که سرور برمی‌گرداند. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: readonly ApiErrorDetail[] = [],
    readonly traceId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = options;
  const method = (rest.method ?? 'GET').toUpperCase();

  const finalHeaders = new Headers(headers);
  if (json !== undefined) {
    finalHeaders.set('Content-Type', 'application/json');
  }

  if (UNSAFE_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) finalHeaders.set(CSRF_HEADER, csrf);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    method,
    headers: finalHeaders,
    // بدون این، کوکی نشست ارسال نمی‌شود.
    credentials: 'same-origin',
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const body = (payload ?? {}) as {
      code?: string;
      message?: string;
      details?: ApiErrorDetail[];
      traceId?: string;
    };
    throw new ApiError(
      response.status,
      body.code ?? 'UNKNOWN',
      body.message ?? 'خطای غیرمنتظره‌ای رخ داد',
      body.details ?? [],
      body.traceId,
    );
  }

  return payload as T;
}
