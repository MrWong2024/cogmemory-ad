// backend/src/modules/auth/guards/session-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, SESSION_COOKIE_NAME } from '../auth.constants';
import { AuthService } from '../services/auth.service';
import type { RequestWithAuthenticatedUser } from '../types/auth-user-context.type';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<RequestWithAuthenticatedUser>();
    const rawToken = this.extractSessionToken(request);

    if (!rawToken) {
      throw new UnauthorizedException();
    }

    const user = await this.authService.validateSessionToken(rawToken);

    if (!user) {
      throw new UnauthorizedException();
    }

    request.user = user;

    return true;
  }

  private extractSessionToken(
    request: RequestWithAuthenticatedUser,
  ): string | null {
    const parsedCookieValue = request.cookies?.[SESSION_COOKIE_NAME];

    if (parsedCookieValue) {
      return parsedCookieValue;
    }

    const rawCookieHeader = request.headers.cookie;

    if (!rawCookieHeader) {
      return null;
    }

    return this.parseCookieHeader(rawCookieHeader)[SESSION_COOKIE_NAME] ?? null;
  }

  private parseCookieHeader(cookieHeader: string): Record<string, string> {
    return cookieHeader
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((cookies, entry) => {
        const separatorIndex = entry.indexOf('=');

        if (separatorIndex <= 0) {
          return cookies;
        }

        const key = entry.slice(0, separatorIndex).trim();
        const value = entry.slice(separatorIndex + 1).trim();

        if (!key) {
          return cookies;
        }

        cookies[key] = this.decodeCookieValue(value);
        return cookies;
      }, {});
  }

  private decodeCookieValue(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
}
