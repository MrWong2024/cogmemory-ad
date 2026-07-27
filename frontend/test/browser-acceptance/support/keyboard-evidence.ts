import type { Locator, Page } from '@playwright/test';

export type AcceptanceKeyboardKey = 'Tab' | 'Shift+Tab' | 'Enter' | 'Space';

export type KeyboardEvidenceEvent = {
  type: 'keydown' | 'keyup';
  key: string;
  isTrusted: boolean;
  controlCategory: string;
};

export type FocusEvidence = {
  controlCategory: string;
  focusVisible: boolean;
};

export type FocusVisualEvidence = FocusEvidence & {
  focused: boolean;
  visibleOutline: boolean;
  visibleBoxShadow: boolean;
  visibleIndicator: boolean;
};

export type TabTraversalEvidence = {
  pressCount: number;
  controlCategories: string[];
};

const persistentKeyboardEvidence = new WeakMap<Page, KeyboardEvidenceEvent[]>();

function installReadOnlyKeyboardListener(): void {
  type EvidenceWindow = Window & {
    __browserAcceptanceKeyboardEvidence?: KeyboardEvidenceEvent[];
    __browserAcceptanceKeyboardListenerInstalled?: boolean;
    __recordBrowserAcceptanceKeyboardEvidence?: (
      event: KeyboardEvidenceEvent,
    ) => Promise<void>;
  };

  const evidenceWindow = window as EvidenceWindow;
  if (evidenceWindow.__browserAcceptanceKeyboardListenerInstalled) return;

  evidenceWindow.__browserAcceptanceKeyboardEvidence = [];
  evidenceWindow.__browserAcceptanceKeyboardListenerInstalled = true;

  const classify = (target: EventTarget | null): string => {
    if (!(target instanceof HTMLElement)) return 'non_element';
    const tagName = target.tagName.toLowerCase();
    if (tagName === 'input') {
      const inputType = (target as HTMLInputElement).type.toLowerCase();
      return inputType === 'checkbox' || inputType === 'radio'
        ? inputType
        : 'input';
    }
    if (tagName === 'button') return 'button';
    if (tagName === 'a') return 'link';
    if (tagName === 'summary') return 'summary';
    if (tagName === 'select') return 'select';
    if (tagName === 'textarea') return 'textarea';
    const role = target.getAttribute('role');
    const safeRoles = new Set([
      'button',
      'checkbox',
      'dialog',
      'link',
      'menuitem',
      'option',
      'radio',
      'switch',
      'tab',
      'textbox',
    ]);
    return role && safeRoles.has(role) ? `role_${role}` : 'other';
  };

  const record = (event: KeyboardEvent): void => {
    const safeEvent: KeyboardEvidenceEvent = {
      type: event.type === 'keydown' ? 'keydown' : 'keyup',
      key: event.key,
      isTrusted: event.isTrusted,
      controlCategory: classify(event.target),
    };
    evidenceWindow.__browserAcceptanceKeyboardEvidence?.push(safeEvent);
    void evidenceWindow.__recordBrowserAcceptanceKeyboardEvidence?.(safeEvent);
  };

  document.addEventListener('keydown', record, true);
  document.addEventListener('keyup', record, true);
}

export async function installKeyboardEvidence(page: Page): Promise<void> {
  const persistent = persistentKeyboardEvidence.get(page) ?? [];
  persistentKeyboardEvidence.set(page, persistent);
  await page.exposeBinding(
    '__recordBrowserAcceptanceKeyboardEvidence',
    (_source, event: unknown) => {
      if (
        typeof event === 'object' &&
        event !== null &&
        ((event as { type?: unknown }).type === 'keydown' ||
          (event as { type?: unknown }).type === 'keyup') &&
        typeof (event as { key?: unknown }).key === 'string' &&
        typeof (event as { isTrusted?: unknown }).isTrusted === 'boolean' &&
        typeof (event as { controlCategory?: unknown }).controlCategory ===
          'string'
      ) {
        persistent.push({ ...(event as KeyboardEvidenceEvent) });
      }
    },
  );
  await page.addInitScript(installReadOnlyKeyboardListener);
  await page.evaluate(installReadOnlyKeyboardListener);
}

export async function clearKeyboardEvidence(page: Page): Promise<void> {
  const persistent = persistentKeyboardEvidence.get(page);
  if (persistent) persistent.length = 0;
  await page.evaluate(() => {
    const evidenceWindow = window as Window & {
      __browserAcceptanceKeyboardEvidence?: KeyboardEvidenceEvent[];
    };
    evidenceWindow.__browserAcceptanceKeyboardEvidence = [];
  });
}

export async function readKeyboardEvidence(
  page: Page,
): Promise<KeyboardEvidenceEvent[]> {
  const currentDocument = await page.evaluate(() => {
    const evidenceWindow = window as Window & {
      __browserAcceptanceKeyboardEvidence?: KeyboardEvidenceEvent[];
    };
    return (evidenceWindow.__browserAcceptanceKeyboardEvidence ?? []).map(
      (event) => ({ ...event }),
    );
  });
  const persistent = persistentKeyboardEvidence.get(page);
  const preferred =
    persistent && persistent.length > currentDocument.length
      ? persistent
      : currentDocument;
  return preferred.map((event) => ({ ...event }));
}

export async function pressKeyboard(
  page: Page,
  key: AcceptanceKeyboardKey,
): Promise<void> {
  await page.keyboard.press(key);
}

export async function pressKeyboardDownUp(
  page: Page,
  key: Exclude<AcceptanceKeyboardKey, 'Shift+Tab'>,
): Promise<void> {
  await page.keyboard.down(key);
  await page.keyboard.up(key);
}

export async function readFocusEvidence(page: Page): Promise<FocusEvidence> {
  return page.evaluate(() => {
    const target = document.activeElement;
    if (!(target instanceof HTMLElement)) {
      return { controlCategory: 'non_element', focusVisible: false };
    }
    const tagName = target.tagName.toLowerCase();
    const inputType =
      target instanceof HTMLInputElement ? target.type.toLowerCase() : '';
    const controlCategory =
      tagName === 'input'
        ? inputType === 'checkbox' || inputType === 'radio'
          ? inputType
          : 'input'
        : tagName === 'a'
          ? 'link'
          : tagName;
    return {
      controlCategory,
      focusVisible: target.matches(':focus-visible'),
    };
  });
}

export async function assertFocusVisible(locator: Locator): Promise<void> {
  const evidence = await readFocusVisualEvidence(locator);
  if (!evidence.focused || !evidence.focusVisible) {
    throw new Error('The keyboard-focused control is not focus-visible');
  }
  if (!evidence.visibleIndicator) {
    throw new Error(
      'The keyboard-focused control has no visible outline or box-shadow',
    );
  }
}

export async function readFocusVisualEvidence(
  locator: Locator,
): Promise<FocusVisualEvidence> {
  return locator.evaluate((node) => {
    const element = node as HTMLElement;
    const style = window.getComputedStyle(element);
    const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
    const outlineColorVisible =
      style.outlineColor !== 'transparent' &&
      !/^rgba\([^)]*,\s*0\s*\)$/.test(style.outlineColor);
    const visibleOutline =
      outlineWidth > 0 && style.outlineStyle !== 'none' && outlineColorVisible;
    const visibleBoxShadow =
      style.boxShadow !== 'none' &&
      !/^rgba\([^)]*,\s*0\s*\)\s+0px\s+0px\s+0px\s+0px$/.test(style.boxShadow);
    const tagName = element.tagName.toLowerCase();
    const inputType =
      element instanceof HTMLInputElement ? element.type.toLowerCase() : '';
    const controlCategory =
      tagName === 'input'
        ? inputType === 'checkbox' || inputType === 'radio'
          ? inputType
          : 'input'
        : tagName === 'a'
          ? 'link'
          : tagName;
    const focusVisible = element.matches(':focus-visible');
    return {
      controlCategory,
      focused: element === document.activeElement,
      focusVisible,
      visibleOutline,
      visibleBoxShadow,
      visibleIndicator: visibleOutline || visibleBoxShadow,
    };
  });
}

export async function tabToLocator(
  page: Page,
  target: Locator,
  maximumTabPresses: number,
  direction: 'forward' | 'backward' = 'forward',
): Promise<TabTraversalEvidence> {
  const controlCategories: string[] = [];
  for (let pressCount = 1; pressCount <= maximumTabPresses; pressCount += 1) {
    await pressKeyboard(page, direction === 'forward' ? 'Tab' : 'Shift+Tab');
    controlCategories.push((await readFocusEvidence(page)).controlCategory);
    const reached = await target.evaluate(
      (node) => node === document.activeElement,
    );
    if (reached) return { pressCount, controlCategories };
  }
  throw new Error('Natural Tab traversal did not reach the target locator');
}

export function assertTrustedKeyPair(
  events: readonly KeyboardEvidenceEvent[],
  key: 'Enter' | ' ',
  controlCategory?: string,
): number {
  const matching = events.filter((event) => event.key === key);
  if (
    matching.length !== 2 ||
    matching[0]?.type !== 'keydown' ||
    matching[1]?.type !== 'keyup' ||
    (controlCategory !== undefined &&
      matching[0].controlCategory !== controlCategory) ||
    matching.some(({ isTrusted }) => !isTrusted)
  ) {
    throw new Error(
      'Expected one trusted keydown and keyup pair for the target control',
    );
  }
  return matching.length;
}

export async function isFocusWithin(locator: Locator): Promise<boolean> {
  return locator.evaluate((node) => node.contains(document.activeElement));
}

export async function assertFocusLeavesRegion(
  page: Page,
  region: Locator,
  maximumTabPresses: number,
): Promise<number> {
  for (let count = 1; count <= maximumTabPresses; count += 1) {
    await pressKeyboard(page, 'Tab');
    if (!(await isFocusWithin(region))) return count;
  }
  throw new Error('Keyboard focus did not leave the target region');
}

export async function pressAndObserveBooleanStateChange(
  page: Page,
  key: 'Enter' | 'Space',
  readState: () => Promise<boolean>,
): Promise<{ before: boolean; after: boolean; changed: boolean }> {
  const before = await readState();
  await pressKeyboard(page, key);
  const after = await readState();
  return { before, after, changed: before !== after };
}
