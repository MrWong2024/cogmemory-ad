import type { ReactNode } from 'react';

export function PatientAdministrationShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--cma-page)]">
      <header className="border-b border-[var(--cma-line)] bg-[var(--cma-surface)]">
        <div className="mx-auto max-w-3xl px-5 py-5 sm:px-8">
          <p className="text-lg font-semibold text-[var(--cma-primary)]">智忆评</p>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold text-[var(--cma-text-strong)]">
              患者施测
            </span>
            <span className="text-base text-[var(--cma-muted)]">
              请在医护人员指导下使用
            </span>
          </div>
        </div>
      </header>
      <main className="px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
