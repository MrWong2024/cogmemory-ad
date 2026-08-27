import {
  ArgumentsHost,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter';

type ErrorResponse = Record<string, unknown>;

function createFilterHarness() {
  const request = { url: '/sensitive-test' };
  const response = {};
  const getRequestUrl = jest
    .fn<string, [unknown]>()
    .mockReturnValue('/sensitive-test');
  const reply = jest.fn<void, [unknown, unknown, number]>();
  const filter = new AllExceptionsFilter({
    httpAdapter: {
      getRequestUrl,
      reply,
    },
  } as unknown as HttpAdapterHost);
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { filter, host, reply };
}

describe('AllExceptionsFilter', () => {
  it('hides an unknown Error message and stack from the 500 response', () => {
    const { filter, host, reply } = createFilterHarness();
    const error = new Error('sensitive internal detail');

    filter.catch(error, host);

    expect(reply).toHaveBeenCalledTimes(1);
    const responseBody = reply.mock.calls[0][1] as ErrorResponse;
    expect(reply.mock.calls[0][2]).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(responseBody.message).toBe('Internal server error');
    expect(JSON.stringify(responseBody)).not.toContain(error.message);
    expect(JSON.stringify(responseBody)).not.toContain(error.stack ?? 'Error');
  });

  it('preserves an explicitly safe HttpException response', () => {
    const { filter, host, reply } = createFilterHarness();

    filter.catch(
      new InternalServerErrorException({
        code: 'SAFE_INTERNAL_ERROR',
        message: 'Safe explicit message',
        reasons: ['safe reason'],
      }),
      host,
    );

    expect(reply.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'SAFE_INTERNAL_ERROR',
        message: 'Safe explicit message',
        reasons: ['safe reason'],
      }),
    );
  });
});
