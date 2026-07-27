import type {
  CDPSession,
  Page,
  Request,
  Response,
} from '@playwright/test';
import {
  sanitizeBodyKeys,
  sanitizeUrlPattern,
} from './safe-output';

type InitiatorCategory =
  | 'navigation'
  | 'parser'
  | 'script'
  | 'preload'
  | 'service_worker'
  | 'other';

type InitiatorSource = 'cdp' | 'playwright';

type CdpRequestWillBeSent = {
  request?: {
    method?: string;
    url?: string;
  };
  initiator?: {
    type?: string;
  };
};

export type NetworkLedgerEntry = {
  method: string;
  status: number | null;
  resourceType: string;
  initiator: InitiatorCategory;
  initiatorSource: InitiatorSource;
  failureReason: 'aborted' | 'timed_out' | 'failed' | null;
  safeUrlPattern: string;
  bodyKeys: string[];
};

export type NetworkLedgerSummary = {
  requestCount: number;
  failedRequestCount: number;
  entries: NetworkLedgerEntry[];
};

type MutableLedgerEntry = NetworkLedgerEntry;

function defaultInitiator(request: Request): InitiatorCategory {
  const resourceType = request.resourceType();
  if (resourceType === 'document') return 'navigation';
  if (resourceType === 'script') return 'parser';
  if (resourceType === 'fetch' || resourceType === 'xhr') return 'script';
  if (resourceType === 'serviceworker') return 'service_worker';
  return 'other';
}

function normalizeCdpInitiator(value: string | undefined): InitiatorCategory {
  if (value === 'parser') return 'parser';
  if (value === 'script') return 'script';
  if (value === 'preload') return 'preload';
  if (value === 'service-worker') return 'service_worker';
  return 'other';
}

function normalizeFailureReason(
  value: string | null,
): NetworkLedgerEntry['failureReason'] {
  if (!value) return null;
  if (/aborted|blocked_by_client/i.test(value)) return 'aborted';
  if (/timed?out/i.test(value)) return 'timed_out';
  return 'failed';
}

function extractBodyKeys(request: Request): string[] {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
    return [];
  }

  const postData = request.postData();
  if (!postData) return [];

  const contentType = request.headers()['content-type'] ?? '';
  try {
    if (contentType.includes('application/json')) {
      const parsed: unknown = JSON.parse(postData);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return sanitizeBodyKeys(Object.keys(parsed));
      }
      return [];
    }

    if (contentType.includes('application/x-www-form-urlencoded')) {
      return sanitizeBodyKeys([...new URLSearchParams(postData).keys()]);
    }

    if (contentType.includes('multipart/form-data')) {
      const keys = [...postData.matchAll(/name="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((value): value is string => value !== undefined);
      return sanitizeBodyKeys(keys);
    }
  } catch {
    return [];
  }

  return [];
}

function cdpQueueKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${sanitizeUrlPattern(url)}`;
}

export class NetworkLedger {
  private readonly records = new Map<Request, MutableLedgerEntry>();
  private readonly cdpInitiators = new Map<string, InitiatorCategory[]>();
  private cdpSession: CDPSession | null = null;
  private page: Page | null = null;

  private readonly onRequest = (request: Request): void => {
    const key = cdpQueueKey(request.method(), request.url());
    const queuedInitiators = this.cdpInitiators.get(key) ?? [];
    const cdpInitiator = queuedInitiators.shift();
    if (queuedInitiators.length === 0) this.cdpInitiators.delete(key);

    this.records.set(request, {
      method: request.method().toUpperCase(),
      status: null,
      resourceType: request.resourceType(),
      initiator: cdpInitiator ?? defaultInitiator(request),
      initiatorSource: cdpInitiator ? 'cdp' : 'playwright',
      failureReason: null,
      safeUrlPattern: sanitizeUrlPattern(request.url()),
      bodyKeys: extractBodyKeys(request),
    });
  };

  private readonly onResponse = (response: Response): void => {
    const record = this.records.get(response.request());
    if (record) record.status = response.status();
  };

  private readonly onRequestFailed = (request: Request): void => {
    const record = this.records.get(request);
    if (record) {
      record.failureReason = normalizeFailureReason(
        request.failure()?.errorText ?? null,
      );
    }
  };

  async attach(page: Page): Promise<void> {
    if (this.page) {
      throw new Error('Network ledger is already attached');
    }

    this.page = page;
    page.on('request', this.onRequest);
    page.on('response', this.onResponse);
    page.on('requestfailed', this.onRequestFailed);

    try {
      const session = await page.context().newCDPSession(page);
      this.cdpSession = session;
      await session.send('Network.enable');
      session.on(
        'Network.requestWillBeSent',
        (event: CdpRequestWillBeSent): void => {
          if (!event.request?.method || !event.request.url) return;
          const key = cdpQueueKey(event.request.method, event.request.url);
          const queue = this.cdpInitiators.get(key) ?? [];
          queue.push(normalizeCdpInitiator(event.initiator?.type));
          this.cdpInitiators.set(key, queue);
        },
      );
    } catch (error: unknown) {
      page.off('request', this.onRequest);
      page.off('response', this.onResponse);
      page.off('requestfailed', this.onRequestFailed);
      this.page = null;
      throw error;
    }
  }

  entries(): NetworkLedgerEntry[] {
    return [...this.records.values()].map((entry) => ({
      ...entry,
      bodyKeys: [...entry.bodyKeys],
    }));
  }

  summary(): NetworkLedgerSummary {
    const entries = this.entries();
    return {
      requestCount: entries.length,
      failedRequestCount: entries.filter(
        ({ failureReason }) => failureReason !== null,
      ).length,
      entries,
    };
  }

  count(input: {
    method?: string;
    safeUrlPattern?: string;
    failureReason?: NetworkLedgerEntry['failureReason'];
  }): number {
    return this.entries().filter(
      (entry) =>
        (input.method === undefined ||
          entry.method === input.method.toUpperCase()) &&
        (input.safeUrlPattern === undefined ||
          entry.safeUrlPattern === input.safeUrlPattern) &&
        (input.failureReason === undefined ||
          entry.failureReason === input.failureReason),
    ).length;
  }

  assertNoAutomaticRetry(
    target: { method: string; safeUrlPattern: string },
    allowedAttempts = 1,
  ): void {
    const count = this.count(target);
    if (count > allowedAttempts) {
      throw new Error('Network ledger detected an unexpected automatic retry');
    }
  }

  assertNoPolling(
    target: { method: string; safeUrlPattern: string },
    allowedRequests = 1,
  ): void {
    const count = this.count(target);
    if (count > allowedRequests) {
      throw new Error('Network ledger detected unexpected polling');
    }
  }

  assertNoNPlusOne(input: {
    method?: string;
    maximumRequestsPerSafePattern: number;
  }): void {
    const counts = new Map<string, number>();
    for (const entry of this.entries()) {
      if (input.method && entry.method !== input.method.toUpperCase()) continue;
      const key = `${entry.method} ${entry.safeUrlPattern}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (
      [...counts.values()].some(
        (count) => count > input.maximumRequestsPerSafePattern,
      )
    ) {
      throw new Error('Network ledger detected an N+1 request pattern');
    }
  }

  async detach(): Promise<NetworkLedgerSummary> {
    const summary = this.summary();
    if (this.page) {
      this.page.off('request', this.onRequest);
      this.page.off('response', this.onResponse);
      this.page.off('requestfailed', this.onRequestFailed);
    }
    if (this.cdpSession) {
      await this.cdpSession.detach();
    }
    this.page = null;
    this.cdpSession = null;
    this.cdpInitiators.clear();
    return summary;
  }
}
