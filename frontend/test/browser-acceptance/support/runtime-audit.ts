import type { ConsoleMessage, Page } from '@playwright/test';
import { sanitizeIdentifier } from './safe-output';

type ConsoleCategory =
  | 'network'
  | 'react'
  | 'security'
  | 'runtime'
  | 'other';

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

export class ConsoleAudit {
  private warningCount = 0;
  private errorCount = 0;
  private pageErrorCount = 0;
  private readonly categoryCounts = new Map<ConsoleCategory, number>();

  private recordCategory(category: ConsoleCategory): void {
    this.categoryCounts.set(
      category,
      (this.categoryCounts.get(category) ?? 0) + 1,
    );
  }

  private readonly onConsole = (message: ConsoleMessage): void => {
    if (message.type() !== 'warning' && message.type() !== 'error') return;
    if (message.type() === 'warning') this.warningCount += 1;
    if (message.type() === 'error') this.errorCount += 1;
    this.recordCategory(classifyConsoleText(message.text()));
  };

  private readonly onPageError = (error: Error): void => {
    this.pageErrorCount += 1;
    this.recordCategory(classifyConsoleText(error.message));
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
