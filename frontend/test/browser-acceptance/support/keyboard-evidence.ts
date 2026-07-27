import type { Locator, Page } from '@playwright/test';

export type AcceptanceKeyboardKey =
  | 'Tab'
  | 'Shift+Tab'
  | 'Enter'
  | 'Space';

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

function installReadOnlyKeyboardListener(): void {
  type EvidenceWindow = Window & {
    __browserAcceptanceKeyboardEvidence?: KeyboardEvidenceEvent[];
    __browserAcceptanceKeyboardListenerInstalled?: boolean;
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
    evidenceWindow.__browserAcceptanceKeyboardEvidence?.push({
      type: event.type === 'keydown' ? 'keydown' : 'keyup',
      key: event.key,
      isTrusted: event.isTrusted,
      controlCategory: classify(event.target),
    });
  };

  document.addEventListener('keydown', record, true);
  document.addEventListener('keyup', record, true);
}

export async function installKeyboardEvidence(page: Page): Promise<void> {
  await page.addInitScript(installReadOnlyKeyboardListener);
  await page.evaluate(installReadOnlyKeyboardListener);
}

export async function clearKeyboardEvidence(page: Page): Promise<void> {
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
  return page.evaluate(() => {
    const evidenceWindow = window as Window & {
      __browserAcceptanceKeyboardEvidence?: KeyboardEvidenceEvent[];
    };
    return (evidenceWindow.__browserAcceptanceKeyboardEvidence ?? []).map(
      (event) => ({ ...event }),
    );
  });
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
  const focusVisible = await locator.evaluate((node) =>
    node.matches(':focus-visible'),
  );
  if (!focusVisible) {
    throw new Error('The keyboard-focused control is not focus-visible');
  }
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
