import type { Locator, Page } from '@playwright/test';

export type AcceptanceViewport = {
  width: number;
  height: number;
};

export const FORMAL_ACCEPTANCE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 800, height: 1280 },
  { width: 1280, height: 800 },
  { width: 1024, height: 1366 },
  { width: 1366, height: 1024 },
  { width: 1280, height: 720 },
  { width: 1536, height: 864 },
] as const satisfies readonly AcceptanceViewport[];

export const RESPONSIVE_STRESS_VIEWPORT = {
  width: 768,
  height: 900,
} as const satisfies AcceptanceViewport;

export type WidthAudit = {
  clientWidth: number;
  scrollWidth: number;
  hasHorizontalOverflow: boolean;
};

export type ViewportAuditSummary = {
  viewport: {
    innerWidth: number;
    innerHeight: number;
  };
  document: WidthAudit;
  main: WidthAudit | null;
  hasGlobalHorizontalOverflow: boolean;
};

export type ElementBoundsSummary = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
  withinViewportHorizontally: boolean;
};

function toWidthAudit(clientWidth: number, scrollWidth: number): WidthAudit {
  return {
    clientWidth,
    scrollWidth,
    hasHorizontalOverflow: scrollWidth > clientWidth,
  };
}

export async function auditViewport(
  page: Page,
  viewport: AcceptanceViewport,
): Promise<ViewportAuditSummary> {
  await page.setViewportSize(viewport);
  const metrics = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const main = document.querySelector('main');
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      documentClientWidth: documentElement.clientWidth,
      documentScrollWidth: documentElement.scrollWidth,
      mainClientWidth: main?.clientWidth ?? null,
      mainScrollWidth: main?.scrollWidth ?? null,
    };
  });

  const documentAudit = toWidthAudit(
    metrics.documentClientWidth,
    metrics.documentScrollWidth,
  );
  const mainAudit =
    metrics.mainClientWidth === null || metrics.mainScrollWidth === null
      ? null
      : toWidthAudit(metrics.mainClientWidth, metrics.mainScrollWidth);

  return {
    viewport: {
      innerWidth: metrics.innerWidth,
      innerHeight: metrics.innerHeight,
    },
    document: documentAudit,
    main: mainAudit,
    hasGlobalHorizontalOverflow:
      documentAudit.hasHorizontalOverflow ||
      (mainAudit?.hasHorizontalOverflow ?? false),
  };
}

export async function auditElementBounds(
  locator: Locator,
): Promise<ElementBoundsSummary> {
  return locator.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return {
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      left: bounds.left,
      width: bounds.width,
      height: bounds.height,
      withinViewportHorizontally:
        bounds.left >= 0 && bounds.right <= window.innerWidth,
    };
  });
}

export async function auditLocalScrollContainer(
  locator: Locator,
): Promise<WidthAudit> {
  const metrics = await locator.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  return toWidthAudit(metrics.clientWidth, metrics.scrollWidth);
}

export function assertNoGlobalHorizontalOverflow(
  summary: ViewportAuditSummary,
): void {
  if (summary.hasGlobalHorizontalOverflow) {
    throw new Error('Unexpected global horizontal overflow was detected');
  }
}
