// frontend/src/lib/env.ts
export const frontendEnv = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:5002',
} as const;
