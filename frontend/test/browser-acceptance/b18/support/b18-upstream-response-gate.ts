import type { APIResponse, Page, Request, Route } from '@playwright/test';

type GateDecision = 'release' | 'abort';

type Waiter<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

export type B18UpstreamResponseGateSummary = {
  matchedRequestCount: number;
  upstreamFetchCount: number;
  upstreamStatus: number | null;
  releasedResponseCount: number;
  abortedBrowserResponseCount: number;
  timedOutCount: number;
};

function waiter<T>(): Waiter<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value: T) => resolvePromise?.(value),
  };
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(handle);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(handle);
        reject(error);
      },
    );
  });
}

export class B18UpstreamResponseGate {
  private readonly upstreamObserved = waiter<void>();
  private readonly decision = waiter<GateDecision>();
  private readonly exactRouteSettled = waiter<void>();
  private installed = false;
  private disposed = false;
  private decisionMade = false;
  private exactRouteInFlight = false;
  private matchedRequestCount = 0;
  private upstreamFetchCount = 0;
  private upstreamStatus: number | null = null;
  private releasedResponseCount = 0;
  private abortedBrowserResponseCount = 0;
  private timedOutCount = 0;

  private readonly handler = async (route: Route): Promise<void> => {
    const request = route.request();
    if (!this.matchesExactRequest(request)) {
      await route.continue();
      return;
    }

    this.matchedRequestCount += 1;
    if (this.matchedRequestCount > 1) {
      await route.continue();
      return;
    }

    this.exactRouteInFlight = true;
    try {
      this.upstreamFetchCount = 1;
      const upstreamResponse: APIResponse = await route.fetch();
      this.upstreamStatus = upstreamResponse.status();
      this.upstreamObserved.resolve();

      let decision: GateDecision;
      try {
        decision = await withTimeout(
          this.decision.promise,
          this.holdTimeoutMs,
          'B18 upstream response gate exceeded its bounded hold timeout',
        );
      } catch {
        this.timedOutCount = 1;
        this.abortedBrowserResponseCount = 1;
        await route.abort('timedout');
        return;
      }

      if (decision === 'abort') {
        this.abortedBrowserResponseCount = 1;
        await route.abort('aborted');
        return;
      }

      await route.fulfill({ response: upstreamResponse });
      this.releasedResponseCount = 1;
    } finally {
      this.exactRouteInFlight = false;
      this.exactRouteSettled.resolve();
    }
  };

  constructor(
    private readonly page: Page,
    private readonly method: 'PATCH',
    private readonly exactPath: string,
    private readonly itemResponseId: string,
    private readonly holdTimeoutMs = 10_000,
  ) {
    if (
      !/^\/[a-z0-9\-/]+$/i.test(exactPath) ||
      !/^[a-f\d]{24}$/i.test(itemResponseId) ||
      !exactPath.endsWith(`/item-responses/${itemResponseId}`)
    ) {
      throw new Error('B18 upstream response gate target is invalid');
    }
  }

  async install(): Promise<void> {
    if (this.installed) return;
    this.installed = true;
    await this.page.route('**/*', this.handler);
  }

  waitForUpstreamResponse(timeoutMs = 10_000): Promise<void> {
    return withTimeout(
      this.upstreamObserved.promise,
      timeoutMs,
      'Timed out waiting for the exact B18 upstream response',
    );
  }

  release(): void {
    if (this.decisionMade) return;
    this.decisionMade = true;
    this.decision.resolve('release');
  }

  abort(): void {
    if (this.decisionMade) return;
    this.decisionMade = true;
    this.decision.resolve('abort');
  }

  summary(): B18UpstreamResponseGateSummary {
    return {
      matchedRequestCount: this.matchedRequestCount,
      upstreamFetchCount: this.upstreamFetchCount,
      upstreamStatus: this.upstreamStatus,
      releasedResponseCount: this.releasedResponseCount,
      abortedBrowserResponseCount: this.abortedBrowserResponseCount,
      timedOutCount: this.timedOutCount,
    };
  }

  async dispose(): Promise<B18UpstreamResponseGateSummary> {
    if (!this.decisionMade) this.abort();
    if (this.exactRouteInFlight) {
      await withTimeout(
        this.exactRouteSettled.promise,
        Math.min(this.holdTimeoutMs, 5_000),
        'Timed out while settling the exact B18 upstream route',
      );
    }
    if (this.installed && !this.disposed) {
      this.disposed = true;
      await this.page.unroute('**/*', this.handler);
    }
    return this.summary();
  }

  private matchesExactRequest(request: Request): boolean {
    return (
      request.method() === this.method &&
      new URL(request.url()).pathname === this.exactPath
    );
  }
}
