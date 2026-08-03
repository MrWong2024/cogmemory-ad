import type { Page, Request, Route } from '@playwright/test';

export type B18ResponseLossSummary = {
  upstreamPatchCount: number;
  upstreamPatchStatus: number | null;
  browserPatchAbortCount: number;
  reconciliationGetAbortCount: number;
  fulfilledBusinessResponseCount: 0;
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

function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const handle = setTimeout(
      () => reject(new Error('B18 response-loss control timed out')),
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

export class B18ResponseLossControl {
  private readonly patchObserved = waiter();
  private readonly readAborted = waiter();
  private installed = false;
  private disposed = false;
  private patchOutcomeLost = false;
  private upstreamPatchCount = 0;
  private upstreamPatchStatus: number | null = null;
  private browserPatchAbortCount = 0;
  private reconciliationGetAbortCount = 0;

  private readonly handler = async (route: Route): Promise<void> => {
    const request = route.request();
    if (
      this.upstreamPatchCount === 0 &&
      request.method() === 'PATCH' &&
      this.matchesExactPath(request, this.patchPath)
    ) {
      this.upstreamPatchCount = 1;
      const response = await route.fetch();
      this.upstreamPatchStatus = response.status();
      if (response.status() !== 200) {
        throw new Error('B18 response-loss upstream PATCH was not successful');
      }
      this.patchOutcomeLost = true;
      this.browserPatchAbortCount = 1;
      this.patchObserved.resolve();
      await route.abort('aborted');
      return;
    }

    if (
      this.patchOutcomeLost &&
      this.reconciliationGetAbortCount === 0 &&
      request.method() === 'GET' &&
      this.matchesExactPath(request, this.executionPath)
    ) {
      this.reconciliationGetAbortCount = 1;
      this.readAborted.resolve();
      await route.abort('aborted');
      return;
    }

    await route.continue();
  };

  constructor(
    private readonly page: Page,
    private readonly patchPath: string,
    private readonly executionPath: string,
  ) {}

  async install(): Promise<void> {
    if (this.installed) return;
    this.installed = true;
    await this.page.route('**/*', this.handler);
  }

  waitForUpstreamPatch(timeoutMs = 10_000): Promise<void> {
    return withTimeout(this.patchObserved.promise, timeoutMs);
  }

  waitForReconciliationAbort(timeoutMs = 10_000): Promise<void> {
    return withTimeout(this.readAborted.promise, timeoutMs);
  }

  summary(): B18ResponseLossSummary {
    return {
      upstreamPatchCount: this.upstreamPatchCount,
      upstreamPatchStatus: this.upstreamPatchStatus,
      browserPatchAbortCount: this.browserPatchAbortCount,
      reconciliationGetAbortCount: this.reconciliationGetAbortCount,
      fulfilledBusinessResponseCount: 0,
    };
  }

  async dispose(): Promise<B18ResponseLossSummary> {
    if (this.installed && !this.disposed) {
      this.disposed = true;
      await this.page.unroute('**/*', this.handler);
    }
    return this.summary();
  }

  private matchesExactPath(request: Request, expectedPath: string): boolean {
    return new URL(request.url()).pathname === expectedPath;
  }
}
