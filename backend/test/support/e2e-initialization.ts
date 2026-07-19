export function requireInitialized<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`E2E initialization failed: ${label} is unavailable`);
  }

  return value;
}
