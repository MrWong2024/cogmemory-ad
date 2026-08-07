import type { ConsoleMessage, Page } from '@playwright/test';
import { sanitizeIdentifier, sanitizeUrlPattern } from './safe-output';

export type ConsoleCategory =
  | 'network'
  | 'react'
  | 'security'
  | 'runtime'
  | 'other';

export type ConsoleAuditEvent = {
  kind: 'console_error' | 'page_error';
  category: ConsoleCategory;
  httpStatus: number | null;
  safeUrlPattern: string | null;
};

export type ConsoleAuditSummary = {
  warningCount: number;
  errorCount: number;
  pageErrorCount: number;
  categories: Array<{
    category: ConsoleCategory;
    count: number;
  }>;
};

export type StorageAuditSummary = {
  localStorageKeys: string[];
  sessionStorageKeys: string[];
  indexedDbNames: string[];
  forbiddenValueDetected: boolean;
  documentCookieEmpty: boolean;
  documentCookieForbiddenPatternDetected: boolean;
  urlHasSensitiveQueryOrHash: boolean;
};

function classifyConsoleText(text: string): ConsoleCategory {
  if (/cors|cookie|credential|content security|csp/i.test(text)) return 'security';
  if (/fetch|network|failed to load|http/i.test(text)) return 'network';
  if (/react|hydration/i.test(text)) return 'react';
  if (/typeerror|referenceerror|syntaxerror/i.test(text)) return 'runtime';
  return 'other';
}

function parseBrowserHttpFailureStatus(text: string): number | null {
  const match =
    /^Failed to load resource: the server responded with a status of (4\d{2}|5\d{2})(?: \([^()\r\n]*\))?$/.exec(
      text,
    );
  return match?.[1] ? Number(match[1]) : null;
}

function readSafeConsoleLocation(message: ConsoleMessage): string | null {
  const locationUrl = message.location().url;
  if (!locationUrl) return null;
  const safeUrlPattern = sanitizeUrlPattern(locationUrl);
  return safeUrlPattern === '<invalid-url>' ? null : safeUrlPattern;
}

export class ConsoleAudit {
  private warningCount = 0;
  private errorCount = 0;
  private pageErrorCount = 0;
  private readonly categoryCounts = new Map<ConsoleCategory, number>();
  private readonly auditEvents: ConsoleAuditEvent[] = [];

  private recordCategory(category: ConsoleCategory): void {
    this.categoryCounts.set(
      category,
      (this.categoryCounts.get(category) ?? 0) + 1,
    );
  }

  private readonly onConsole = (message: ConsoleMessage): void => {
    if (message.type() !== 'warning' && message.type() !== 'error') return;
    if (message.type() === 'warning') this.warningCount += 1;
    const category = classifyConsoleText(message.text());
    if (message.type() === 'error') {
      this.errorCount += 1;
      this.auditEvents.push({
        kind: 'console_error',
        category,
        httpStatus: parseBrowserHttpFailureStatus(message.text()),
        safeUrlPattern: readSafeConsoleLocation(message),
      });
    }
    this.recordCategory(category);
  };

  private readonly onPageError = (error: Error): void => {
    this.pageErrorCount += 1;
    const category = classifyConsoleText(error.message);
    this.recordCategory(category);
    this.auditEvents.push({
      kind: 'page_error',
      category,
      httpStatus: null,
      safeUrlPattern: null,
    });
  };

  constructor(private readonly page: Page) {}

  start(): void {
    this.page.on('console', this.onConsole);
    this.page.on('pageerror', this.onPageError);
  }

  summary(): ConsoleAuditSummary {
    return {
      warningCount: this.warningCount,
      errorCount: this.errorCount,
      pageErrorCount: this.pageErrorCount,
      categories: [...this.categoryCounts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((left, right) => left.category.localeCompare(right.category)),
    };
  }

  events(): ConsoleAuditEvent[] {
    return this.auditEvents.map((event) => ({ ...event }));
  }

  stop(): ConsoleAuditSummary {
    this.page.off('console', this.onConsole);
    this.page.off('pageerror', this.onPageError);
    return this.summary();
  }
}

export async function auditRuntimeStorage(
  page: Page,
): Promise<StorageAuditSummary> {
  const raw = await page.evaluate(async () => {
    const forbiddenPattern =
      /password|passwd|bearer|token|session|cookie|objectkey|metadata|[a-f\d]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
    const localStorageKeys = Object.keys(localStorage);
    const sessionStorageKeys = Object.keys(sessionStorage);
    const storageValues = [
      ...localStorageKeys.map((key) => localStorage.getItem(key) ?? ''),
      ...sessionStorageKeys.map((key) => sessionStorage.getItem(key) ?? ''),
    ];
    const indexedDbNames =
      typeof indexedDB.databases === 'function'
        ? (await indexedDB.databases())
            .map(({ name }) => name)
            .filter((name): name is string => typeof name === 'string')
        : [];
    const cookieText = document.cookie;
    const queryAndHash = `${window.location.search}${window.location.hash}`;

    return {
      localStorageKeys,
      sessionStorageKeys,
      indexedDbNames,
      forbiddenValueDetected: storageValues.some((value) =>
        forbiddenPattern.test(value),
      ),
      documentCookieEmpty: cookieText === '',
      documentCookieForbiddenPatternDetected: forbiddenPattern.test(cookieText),
      urlHasSensitiveQueryOrHash: forbiddenPattern.test(queryAndHash),
    };
  });

  return {
    ...raw,
    localStorageKeys: raw.localStorageKeys.map(sanitizeIdentifier).sort(),
    sessionStorageKeys: raw.sessionStorageKeys.map(sanitizeIdentifier).sort(),
    indexedDbNames: raw.indexedDbNames.map(sanitizeIdentifier).sort(),
  };
}
