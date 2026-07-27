import path from 'node:path';
import type { Page } from '@playwright/test';

const MONGO_ID = /^[a-f\d]{24}$/i;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const LONG_DYNAMIC_TOKEN = /^[A-Za-z0-9_-]{20,}$/;
const FORBIDDEN_OUTPUT_KEY =
  /^(?:password|passwd|cookie|session|token|metadata|objectkey)$/i;

function isDynamicIdentifier(value: string): boolean {
  return (
    MONGO_ID.test(value) ||
    UUID.test(value) ||
    ULID.test(value) ||
    LONG_DYNAMIC_TOKEN.test(value)
  );
}

export function sanitizeIdentifier(value: string): string {
  if (FORBIDDEN_OUTPUT_KEY.test(value)) {
    return '<blocked-key>';
  }
  return isDynamicIdentifier(value) ? '<id>' : value;
}

export function sanitizeUrlPattern(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value, 'http://browser-acceptance.invalid');
  } catch {
    return '<invalid-url>';
  }

  const safePath = parsed.pathname
    .split('/')
    .map((segment) => sanitizeIdentifier(decodeURIComponent(segment)))
    .join('/');
  return safePath || '/';
}

export function sanitizeBodyKeys(keys: readonly string[]): string[] {
  return [...new Set(keys.map(sanitizeIdentifier))].sort();
}

export function assertSafeSummary(
  summary: unknown,
  forbiddenLiterals: readonly string[] = [],
): void {
  const serialized = JSON.stringify(summary);
  const containsForbiddenLiteral = forbiddenLiterals.some(
    (literal) => literal.length > 0 && serialized.includes(literal),
  );
  const containsDynamicId =
    /\b[a-f\d]{24}\b/i.test(serialized) ||
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
      serialized,
    );
  const containsCompleteUrl = /https?:\/\/[^\s"}]+[/?#][^\s"}]*/i.test(
    serialized,
  );

  if (containsForbiddenLiteral || containsDynamicId || containsCompleteUrl) {
    throw new Error('Unsafe Browser acceptance summary was rejected');
  }
}

export function safeJsonStringify(
  summary: unknown,
  forbiddenLiterals: readonly string[] = [],
): string {
  assertSafeSummary(summary, forbiddenLiterals);
  return JSON.stringify(summary);
}

export type SafeScreenshotOptions = {
  relativePath: string;
  loginPasswordStateCleared: boolean;
  usesDeidentifiedFixture: boolean;
};

export type SafeScreenshotSummary = {
  artifact: 'screenshot';
  captured: boolean;
};

export async function takeSafeScreenshot(
  page: Page,
  options: SafeScreenshotOptions,
): Promise<SafeScreenshotSummary> {
  if (
    !options.loginPasswordStateCleared ||
    !options.usesDeidentifiedFixture
  ) {
    throw new Error('Safe screenshot preconditions were not satisfied');
  }

  const artifactRoot = path.resolve(process.cwd(), 'test-results');
  const target = path.resolve(artifactRoot, options.relativePath);
  const isInsideArtifactRoot =
    target.startsWith(`${artifactRoot}${path.sep}`) &&
    path.extname(target).toLowerCase() === '.png';
  if (!isInsideArtifactRoot) {
    throw new Error('Safe screenshots must use a PNG path under test-results');
  }

  await page.screenshot({ path: target });
  return { artifact: 'screenshot', captured: true };
}
