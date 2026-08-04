import type { Page, Request, Route } from '@playwright/test';

export type B18ExactRequestAbortSummary = {
  matchedRequestCount: number;
  abortedRequestCount: number;
  continuedRequestCount: number;
};

type Waiter = {
  promise: Promise<void>;
  resolve: () => void;
};

function waiter(): Waiter {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: () => resolvePromise?.() };
}

function withTimeout(
  promise: Promise<void>,
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const handle = setTimeout(
      () => reject(new Error('B18 exact request abort timed out')),
      timeoutMs,
    );
    promise.then(
      () => {
        clearTimeout(handle);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(handle);
        reject(error);
      },
    );
  });
}

export class B18ExactRequestAbort {
  private readonly aborted = waiter();
  private installed = false;
  private disposed = false;
  private matchedRequestCount = 0;
  private abortedRequestCount = 0;
  private continuedRequestCount = 0;

  private readonly handler = async (route: Route): Promise<void> => {
    const request = route.request();

    if (!this.matches(request)) {
      await route.continue();
      return;
    }

    this.matchedRequestCount += 1;
    if (this.abortedRequestCount === 0) {
      this.abortedRequestCount = 1;
      this.aborted.resolve();
      await route.abort('aborted');
      return;
    }

    this.continuedRequestCount += 1;
    await route.continue();
  };

  constructor(
    private readonly page: Page,
    private readonly exactUrl: string,
  ) {
    const parsed = new URL(exactUrl);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.search !== '' ||
      parsed.hash !== '' ||
      !parsed.pathname.endsWith('/media-evidences')
    ) {
      throw new Error('B18 exact request abort target is invalid');
    }
  }

  async install(): Promise<void> {
    if (this.installed || this.disposed) {
      throw new Error('B18 exact request abort cannot be installed twice');
    }
    await this.page.route(this.exactUrl, this.handler);
    this.installed = true;
  }

  waitForAbort(timeoutMs = 10_000): Promise<void> {
    return withTimeout(this.aborted.promise, timeoutMs);
  }

  summary(): B18ExactRequestAbortSummary {
    return {
      matchedRequestCount: this.matchedRequestCount,
      abortedRequestCount: this.abortedRequestCount,
      continuedRequestCount: this.continuedRequestCount,
    };
  }

  async dispose(): Promise<B18ExactRequestAbortSummary> {
    if (this.installed && !this.disposed) {
      this.disposed = true;
      await this.page.unroute(this.exactUrl, this.handler);
      this.installed = false;
    }
    return this.summary();
  }

  private matches(request: Request): boolean {
    return request.method() === 'POST' && request.url() === this.exactUrl;
  }
}
