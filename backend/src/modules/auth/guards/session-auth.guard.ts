// backend/src/modules/auth/guards/session-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth.constants';
import { AuthService } from '../services/auth.service';
import type { RequestWithAuthenticatedUser } from '../types/auth-user-context.type';
import { readSessionTokenFromRequest } from '../utils/session-cookie.util';

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
    const rawToken = readSessionTokenFromRequest(request);

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
}
