// backend/src/modules/auth/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type {
  AuthenticatedUserContext,
  RequestWithAuthenticatedUser,
} from '../types/auth-user-context.type';

export const CurrentUser = createParamDecorator(
  (
    _data: unknown,
    ctx: ExecutionContext,
  ): AuthenticatedUserContext | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<RequestWithAuthenticatedUser>();

    return request.user;
  },
);
