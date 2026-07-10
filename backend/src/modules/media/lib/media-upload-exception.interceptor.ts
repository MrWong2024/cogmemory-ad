import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';

type MulterLikeError = {
  name?: unknown;
  code?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMulterLikeError(error: unknown): error is MulterLikeError {
  return isRecord(error) && error.name === 'MulterError';
}

@Injectable()
export class MediaUploadExceptionInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpException && error.getStatus() === 413) {
          return throwError(
            () =>
              new PayloadTooLargeException({
                code: 'MEDIA_FILE_TOO_LARGE',
                message: 'Media file is too large',
              }),
          );
        }

        if (!isMulterLikeError(error)) {
          return throwError(() => error);
        }

        if (error.code === 'LIMIT_FILE_SIZE') {
          return throwError(
            () =>
              new PayloadTooLargeException({
                code: 'MEDIA_FILE_TOO_LARGE',
                message: 'Media file is too large',
              }),
          );
        }

        return throwError(
          () =>
            new BadRequestException({
              code: 'MEDIA_FILE_TYPE_NOT_ALLOWED',
              message: 'Media upload request is invalid',
            }),
        );
      }),
    );
  }
}
