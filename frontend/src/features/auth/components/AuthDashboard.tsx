// frontend/src/features/auth/components/AuthDashboard.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import { useAuth } from '@/src/features/auth/hooks/use-auth';

const futureCapabilities = [
  {
    title: '评估执行',
    description: '后续接入 MMSE / MoCA 评估执行流程。',
  },
  {
    title: '历史记录',
    description: '后续接入可追溯的评估记录。',
  },
  {
    title: '报告确认',
    description: '后续接入临床报告复核与确认。',
  },
  {
    title: '科研导出',
    description: '后续接入符合隐私边界的脱敏导出。',
  },
] as const;

const linkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-4 py-2 text-base font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

export function AuthDashboard() {
  const router = useRouter();
  const { status, user, error, refresh, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [router, status]);

  async function handleSignOut() {
    setIsSigningOut(true);
    await signOut();
    router.replace('/login');
  }

  if (status === 'loading') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>正在验证认证状态</CardTitle>
          <CardDescription>
            正在通过认证服务确认当前会话，请稍候。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <Card>
        <CardHeader>
          <Badge tone="warning">会话失效</Badge>
          <CardTitle>登录状态已失效，请重新登录。</CardTitle>
          <CardDescription>正在返回登录页。</CardDescription>
        </CardHeader>
        <CardContent>
          <Link className={linkClassName} href="/login">
            前往登录
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (status === 'error' || !user) {
    return (
      <Card>
        <CardHeader>
          <Badge tone="warning">连接异常</Badge>
          <CardTitle>暂时无法确认认证状态</CardTitle>
          <CardDescription>
            {error ?? '暂时无法连接认证服务，请稍后再试。'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => void refresh()}>重新检查</Button>
          <Link className={linkClassName} href="/login">
            返回登录页
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-8">
      <Card>
        <CardHeader className="gap-3 border-b border-[var(--cma-line)] sm:flex sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-2">
            <Badge tone="success">认证状态已连接</Badge>
            <CardTitle>{user.displayName}</CardTitle>
            <CardDescription>
              当前页面仅用于验证前端认证状态和 HttpOnly Cookie 会话接入。
            </CardDescription>
          </div>
          <Button
            disabled={isSigningOut}
            onClick={() => void handleSignOut()}
            variant="secondary"
          >
            {isSigningOut ? '正在退出...' : '退出登录'}
          </Button>
        </CardHeader>
        <CardContent className="pt-5">
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                显示名称
              </dt>
              <dd className="mt-1 text-lg font-semibold text-[var(--cma-text-strong)]">
                {user.displayName}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                账号
              </dt>
              <dd className="mt-1 break-all text-lg text-[var(--cma-text-strong)]">
                {user.accountName}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                用户类型
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {user.userType ?? '未提供'}
              </dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                角色摘要
              </dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {user.roles.length > 0 ? (
                  user.roles.map((role) => (
                    <Badge key={role} tone="info">
                      {role}
                    </Badge>
                  ))
                ) : (
                  <span className="text-base text-[var(--cma-muted)]">
                    未分配角色
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <section aria-labelledby="future-capabilities-title">
        <div className="mb-4">
          <h2
            className="text-2xl font-semibold text-[var(--cma-text-strong)]"
            id="future-capabilities-title"
          >
            后续能力占位
          </h2>
          <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
            以下功能尚未实现，本页不调用任何认证以外的业务接口。
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {futureCapabilities.map((capability) => (
            <Card key={capability.title}>
              <CardHeader>
                <Badge tone="neutral">后续建设</Badge>
                <CardTitle className="text-xl">{capability.title}</CardTitle>
                <CardDescription>{capability.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
