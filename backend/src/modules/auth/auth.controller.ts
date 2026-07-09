// backend/src/modules/auth/auth.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { DEFAULT_SESSION_TTL_MS, SESSION_COOKIE_NAME } from './auth.constants';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { AuthService } from './services/auth.service';
import type { AuthenticatedUserContext } from './types/auth-user-context.type';
import type {
  LoginResponse,
  LogoutResponse,
  MeResponse,
} from './types/auth-response.types';
import {
  buildClearSessionCookieOptions,
  buildSessionCookieOptions,
  readSessionTokenFromRequest,
} from './utils/session-cookie.util';
import type {
  CookieLikeRequest,
  SessionCookieResponse,
} from './utils/session-cookie.util';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: CookieLikeRequest,
    @Res({ passthrough: true }) response: SessionCookieResponse,
  ): Promise<LoginResponse> {
    const authResult = await this.authService.authenticateWithPassword({
      accountName: loginDto.accountName,
      password: loginDto.password,
      userAgent: this.readHeaderValue(request.headers?.['user-agent']),
      ipAddress: request.ip ?? request.socket?.remoteAddress,
    });

    if (!authResult) {
      throw new UnauthorizedException();
    }

    response.cookie(
      SESSION_COOKIE_NAME,
      authResult.rawSessionToken,
      buildSessionCookieOptions(
        this.isProductionRuntime(),
        DEFAULT_SESSION_TTL_MS,
      ),
    );

    return {
      authenticated: true,
      user: this.authService.toAuthUserResponse(authResult.user),
    };
  }

  @Public()
  @Post('logout')
  async logout(
    @Req() request: CookieLikeRequest,
    @Res({ passthrough: true }) response: SessionCookieResponse,
  ): Promise<LogoutResponse> {
    const rawSessionToken = readSessionTokenFromRequest(request);

    if (rawSessionToken) {
      await this.authService.revokeSessionByToken(rawSessionToken);
    }

    response.clearCookie(
      SESSION_COOKIE_NAME,
      buildClearSessionCookieOptions(this.isProductionRuntime()),
    );

    return {
      ok: true,
      authenticated: false,
    };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUserContext | undefined): MeResponse {
    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      authenticated: true,
      user: this.authService.toAuthUserResponse(user),
    };
  }

  private readHeaderValue(
    value: string | string[] | undefined,
  ): string | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  }

  private isProductionRuntime(): boolean {
    return process.env.NODE_ENV === 'production';
  }
}
