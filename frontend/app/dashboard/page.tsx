// frontend/app/dashboard/page.tsx
import type { Metadata } from 'next';

import { Badge } from '@/src/components/ui/Badge';
import { AuthDashboard } from '@/src/features/auth/components/AuthDashboard';

export const metadata: Metadata = {
  title: '工作台 | 智忆评',
};

export default function DashboardPage() {
  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="border-b border-[var(--cma-line)] pb-7">
          <Badge tone="info">临床工作区入口</Badge>
          <h1 className="mt-4 text-3xl font-semibold text-[var(--cma-text-strong)] sm:text-4xl">
            智忆评工作台
          </h1>
          <p className="mt-3 max-w-3xl text-lg leading-8 text-[var(--cma-muted)]">
            患者档案与评估访视最小闭环已接入；本页仍是轻量入口，不是完整医生工作台。
          </p>
        </header>

        <AuthDashboard />
      </div>
    </main>
  );
}
