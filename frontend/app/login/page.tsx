// frontend/app/login/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/src/components/ui/Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import { LoginForm } from '@/src/features/auth/components/LoginForm';

export const metadata: Metadata = {
  title: '登录 | 智忆评',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_26rem] lg:items-center">
        <section className="max-w-2xl">
          <Badge tone="info">机构账号登录</Badge>
          <p className="mt-6 text-base font-semibold text-[var(--cma-primary)]">
            CogMemory AD
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-[var(--cma-text-strong)] sm:text-5xl">
            智忆评
          </h1>
          <p className="mt-4 text-xl leading-8 text-[var(--cma-muted)]">
            阿尔茨海默病认知评估与辅助诊断系统
          </p>
          <div className="mt-8 border-l-4 border-[var(--cma-line-strong)] pl-5">
            <p className="text-base leading-7 text-[var(--cma-text)]">
              请使用机构分配的账号登录。核心认知评估需由医护或研究人员陪伴或监督完成。
            </p>
          </div>
          <Link
            className="mt-7 inline-flex text-base font-semibold text-[var(--cma-primary)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]"
            href="/"
          >
            返回公共首页
          </Link>
        </section>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>登录系统</CardTitle>
            <CardDescription>
              输入账号和密码后，系统将通过安全会话确认身份。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
