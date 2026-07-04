// backend/src/common/filters/all-exceptions.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

type ErrorResponseBody = {
  code?: string;
  error?: string;
  message?: string | string[];
  remainingSeconds?: number;
  reasons?: string[];
  statusCode?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toErrorResponseBody(value: unknown): ErrorResponseBody | null {
  if (!isRecord(value)) {
    return null;
  }

  const responseBody: ErrorResponseBody = {};

  if (typeof value.message === 'string' || Array.isArray(value.message)) {
    responseBody.message = value.message;
  }

  if (typeof value.error === 'string') {
    responseBody.error = value.error;
  }

  if (typeof value.code === 'string') {
    responseBody.code = value.code;
  }

  if (typeof value.remainingSeconds === 'number') {
    responseBody.remainingSeconds = value.remainingSeconds;
  }

  if (
    Array.isArray(value.reasons) &&
    value.reasons.every((reason) => typeof reason === 'string')
  ) {
    responseBody.reasons = value.reasons;
  }

  if (typeof value.statusCode === 'number') {
    responseBody.statusCode = value.statusCode;
  }

  return responseBody;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<unknown>();
    const request = ctx.getRequest<unknown>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let code: string | undefined;
    let message = 'Internal server error';
    let remainingSeconds: number | undefined;
    let reasons: string[] | undefined;

    if (exception instanceof HttpException) {
      const responseBody = exception.getResponse();

      if (typeof responseBody === 'string') {
        message = responseBody;
      } else {
        const parsedResponseBody = toErrorResponseBody(responseBody);

        if (typeof parsedResponseBody?.message === 'string') {
          message = parsedResponseBody.message;
        } else if (Array.isArray(parsedResponseBody?.message)) {
          message = parsedResponseBody.message
            .filter((item): item is string => typeof item === 'string')
            .join('; ');
        } else if (typeof parsedResponseBody?.error === 'string') {
          message = parsedResponseBody.error;
        }

        code = parsedResponseBody?.code;
        remainingSeconds = parsedResponseBody?.remainingSeconds;
        reasons = parsedResponseBody?.reasons;
      }
    } else if (exception instanceof Error && exception.message) {
      message = exception.message;
    }

    const body = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: String(httpAdapter.getRequestUrl(request)),
      message,
      ...(code ? { code } : {}),
      ...(remainingSeconds !== undefined ? { remainingSeconds } : {}),
      ...(reasons ? { reasons } : {}),
    };

    httpAdapter.reply(response, body, status);
  }
}
