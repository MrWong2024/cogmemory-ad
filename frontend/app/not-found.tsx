// frontend/app/not-found.tsx
import Link from 'next/link';

import { Badge } from '@/src/components/ui/Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-8">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <Badge tone="warning">404</Badge>
          <CardTitle>页面未找到</CardTitle>
          <CardDescription>
            当前地址不存在或尚未开放。请返回公共首页，真实业务页面将在后续阶段逐步实现。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-primary)] bg-[var(--cma-primary)] px-4 py-2 text-base font-semibold text-white transition-colors hover:bg-[var(--cma-primary-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]"
            href="/"
          >
            返回首页
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
