import type { Page, Request, Route } from '@playwright/test';

export type RequestMatcher =
  | string
  | RegExp
  | ((request: Request) => boolean);

export type NetworkControlSummary = {
  matchedRequestCount: number;
  abortedRequestCount: number;
  continuedRequestCount: number;
};

function matchesRequest(request: Request, matcher: RequestMatcher): boolean {
  if (typeof matcher === 'function') return matcher(request);
  if (typeof matcher === 'string') return request.url().includes(matcher);
  return matcher.test(request.url());
}

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

export class OneShotRequestAbort {
  private matchedRequestCount = 0;
  private abortedRequestCount = 0;
  private continuedRequestCount = 0;
  private startedResolve: (() => void) | null = null;
  private readonly started = new Promise<void>((resolve) => {
    this.startedResolve = resolve;
  });

  private readonly handler = async (route: Route): Promise<void> => {
    if (!matchesRequest(route.request(), this.matcher)) {
      await route.continue();
      return;
    }

    this.matchedRequestCount += 1;
    this.startedResolve?.();
    this.startedResolve = null;
    if (this.abortedRequestCount === 0) {
      this.abortedRequestCount = 1;
      await route.abort('aborted');
      return;
    }

    this.continuedRequestCount += 1;
    await route.continue();
  };

  constructor(
    private readonly page: Page,
    private readonly matcher: RequestMatcher,
  ) {}

  async install(): Promise<void> {
    await this.page.route('**/*', this.handler);
  }

  async waitForStarted(timeoutMs = 5_000): Promise<void> {
    await withTimeout(
      this.started,
      timeoutMs,
      'Timed out waiting for the one-shot request to start',
    );
  }

  summary(): NetworkControlSummary {
    return {
      matchedRequestCount: this.matchedRequestCount,
      abortedRequestCount: this.abortedRequestCount,
      continuedRequestCount: this.continuedRequestCount,
    };
  }

  async dispose(): Promise<NetworkControlSummary> {
    await this.page.unroute('**/*', this.handler);
    return this.summary();
  }
}

type GateDecision = 'continue' | 'abort';

export class ControlledRequestGate {
  private matchedRequestCount = 0;
  private abortedRequestCount = 0;
  private continuedRequestCount = 0;
  private decisionResolve: ((decision: GateDecision) => void) | null = null;
  private readonly decision = new Promise<GateDecision>((resolve) => {
    this.decisionResolve = resolve;
  });
  private startedResolve: (() => void) | null = null;
  private readonly started = new Promise<void>((resolve) => {
    this.startedResolve = resolve;
  });

  private readonly handler = async (route: Route): Promise<void> => {
    if (!matchesRequest(route.request(), this.matcher)) {
      await route.continue();
      return;
    }

    this.matchedRequestCount += 1;
    if (this.matchedRequestCount > 1) {
      this.continuedRequestCount += 1;
      await route.continue();
      return;
    }

    this.startedResolve?.();
    this.startedResolve = null;
    let decision: GateDecision;
    try {
      decision = await withTimeout(
        this.decision,
        this.holdTimeoutMs,
        'Controlled request gate exceeded its bounded hold timeout',
      );
    } catch {
      this.abortedRequestCount += 1;
      await route.abort('timedout');
      return;
    }

    if (decision === 'abort') {
      this.abortedRequestCount += 1;
      await route.abort('aborted');
    } else {
      this.continuedRequestCount += 1;
      await route.continue();
    }
  };

  constructor(
    private readonly page: Page,
    private readonly matcher: RequestMatcher,
    private readonly holdTimeoutMs = 5_000,
  ) {}

  async install(): Promise<void> {
    await this.page.route('**/*', this.handler);
  }

  async waitForStarted(timeoutMs = 5_000): Promise<void> {
    await withTimeout(
      this.started,
      timeoutMs,
      'Timed out waiting for the controlled request to start',
    );
  }

  resume(): void {
    this.decisionResolve?.('continue');
    this.decisionResolve = null;
  }

  abort(): void {
    this.decisionResolve?.('abort');
    this.decisionResolve = null;
  }

  summary(): NetworkControlSummary {
    return {
      matchedRequestCount: this.matchedRequestCount,
      abortedRequestCount: this.abortedRequestCount,
      continuedRequestCount: this.continuedRequestCount,
    };
  }

  async dispose(): Promise<NetworkControlSummary> {
    await this.page.unroute('**/*', this.handler);
    return this.summary();
  }
}
