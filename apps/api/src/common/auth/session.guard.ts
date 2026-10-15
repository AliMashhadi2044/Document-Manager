import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AppError } from '../errors/app-error';
import { PUBLIC_KEY, type AuthenticatedUser } from './auth.decorators';
import {
  CSRF_HEADER,
  SESSION_COOKIE,
  SessionService,
} from '../../modules/auth/session.service';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * لایه ۱ — احراز هویت و CSRF.
 *
 * چون احراز هویت کوکی‌محور است، محافظت CSRF بخشی از همین تصمیم است و اختیاری نیست
 * (ADR-0004). الگو: double-submit — توکن در کوکی غیر HttpOnly و همان مقدار در هدر،
 * که سرور آن را با مقدار **گره‌خورده به نشست** می‌سنجد.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const sessionToken = cookies?.[SESSION_COOKIE];

    if (!sessionToken) {
      throw AppError.unauthorized();
    }

    const user = await this.sessions.validate(sessionToken);
    if (!user) {
      throw AppError.unauthorized('نشست شما منقضی شده است. دوباره وارد شوید.');
    }

    if (UNSAFE_METHODS.has(request.method)) {
      const header = request.headers[CSRF_HEADER];
      const csrfToken = Array.isArray(header) ? header[0] : header;
      if (!csrfToken || !(await this.sessions.matchesCsrf(user.sessionId, csrfToken))) {
        throw AppError.forbidden('درخواست نامعتبر است (CSRF)');
      }
    }

    request.user = user;
    return true;
  }
}
