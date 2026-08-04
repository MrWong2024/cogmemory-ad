import type { Page, Request, Route } from '@playwright/test';

export type B18ExactRequestGateSummary = {
  matchedRequestCount: number;
  abortedRequestCount: number;
  continuedRequestCount: number;
};

type GateDecision = 'continue' | 'abort';
type StartedState = 'started' | 'disposed';

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  safeMessage: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(safeMessage)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function requestBody(request: Request): unknown {
  try {
    return request.postDataJSON();
  } catch {
    return null;
  }
}

export class B18ExactRequestGate {
  private matchedRequestCount = 0;
  private abortedRequestCount = 0;
  private continuedRequestCount = 0;
  private installed = false;
  private disposed = false;
  private decisionResolve: ((decision: GateDecision) => void) | null = null;
  private readonly decision = new Promise<GateDecision>((resolve) => {
    this.decisionResolve = resolve;
  });
  private startedResolve: ((state: StartedState) => void) | null = null;
  private readonly started = new Promise<StartedState>((resolve) => {
    this.startedResolve = resolve;
  });
  private readonly inFlight = new Set<Promise<void>>();

  private readonly handler = (route: Route): Promise<void> => {
    const operation = this.handle(route);
    this.inFlight.add(operation);
    operation.then(
      () => this.inFlight.delete(operation),
      () => this.inFlight.delete(operation),
    );
    return operation;
  };

  constructor(
    private readonly page: Page,
    private readonly exactUrl: string,
    private readonly matchesBody: (body: unknown) => boolean,
    private readonly holdTimeoutMs = 5_000,
  ) {
    const parsed = new URL(exactUrl);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      throw new Error('B18 exact request gate requires one absolute URL');
    }
    if (!Number.isSafeInteger(holdTimeoutMs) || holdTimeoutMs <= 0) {
      throw new Error('B18 exact request gate requires a bounded hold timeout');
    }
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const matches =
      !this.disposed &&
      request.method() === 'PATCH' &&
      request.url() === this.exactUrl &&
      this.matchesBody(requestBody(request));

    if (!matches) {
      await route.continue();
      return;
    }

    this.matchedRequestCount += 1;
    if (this.matchedRequestCount > 1) {
      this.continuedRequestCount += 1;
      await route.continue();
      return;
    }

    this.startedResolve?.('started');
    this.startedResolve = null;
    let decision: GateDecision;
    try {
      decision = await withTimeout(
        this.decision,
        this.holdTimeoutMs,
        'B18 exact request gate exceeded its bounded hold timeout',
      );
    } catch {
      decision = 'abort';
    }

    if (decision === 'continue') {
      this.continuedRequestCount += 1;
      await route.continue();
      return;
    }

    this.abortedRequestCount += 1;
    await route.abort('timedout');
  }

  async install(): Promise<void> {
    if (this.installed || this.disposed) {
      throw new Error('B18 exact request gate cannot be installed twice');
    }
    await this.page.route(this.exactUrl, this.handler);
    this.installed = true;
  }

  async waitForStarted(timeoutMs = 5_000): Promise<void> {
    const state = await withTimeout(
      this.started,
      timeoutMs,
      'Timed out waiting for the B18 exact request gate to start',
    );
    if (state !== 'started') {
      throw new Error('B18 exact request gate was disposed before it started');
    }
  }

  resume(): void {
    this.decisionResolve?.('continue');
    this.decisionResolve = null;
  }

  abort(): void {
    this.decisionResolve?.('abort');
    this.decisionResolve = null;
  }

  summary(): B18ExactRequestGateSummary {
    return {
      matchedRequestCount: this.matchedRequestCount,
      abortedRequestCount: this.abortedRequestCount,
      continuedRequestCount: this.continuedRequestCount,
    };
  }

  async dispose(): Promise<B18ExactRequestGateSummary> {
    if (this.disposed) return this.summary();
    this.disposed = true;
    this.abort();
    this.startedResolve?.('disposed');
    this.startedResolve = null;
    if (this.installed) {
      await this.page.unroute(this.exactUrl, this.handler);
      this.installed = false;
    }
    const results = await Promise.allSettled([...this.inFlight]);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (rejected) throw rejected.reason;
    return this.summary();
  }
}
