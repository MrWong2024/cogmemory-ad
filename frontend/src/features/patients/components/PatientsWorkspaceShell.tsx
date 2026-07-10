'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
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

const navLinkClassName =
  'inline-flex min-h-11 items-center rounded-md px-3 py-2 text-base font-semibold text-[var(--cma-text-strong)] transition-colors hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

const secondaryLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-4 py-2 text-base font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

export function PatientsWorkspaceShell({ children }: { children: ReactNode }) {
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
      <main className="min-h-screen px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <Card aria-live="polite" role="status">
            <CardHeader>
              <CardTitle>正在确认登录状态</CardTitle>
              <CardDescription>
                正在通过认证服务确认当前会话，请稍候。
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <main className="min-h-screen px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <Card aria-live="polite" role="status">
            <CardHeader>
              <Badge tone="warning">会话失效</Badge>
              <CardTitle>登录状态已失效，请重新登录。</CardTitle>
              <CardDescription>正在返回登录页。</CardDescription>
            </CardHeader>
            <CardContent>
              <Link className={secondaryLinkClassName} href="/login">
                前往登录
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (status === 'error' || !user) {
    return (
      <main className="min-h-screen px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <Card role="alert">
            <CardHeader>
              <Badge tone="warning">连接异常</Badge>
              <CardTitle>暂时无法确认认证状态</CardTitle>
              <CardDescription>
                {error ?? '暂时无法连接认证服务，请稍后再试。'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button onClick={() => void refresh()}>重新检查</Button>
              <Link className={secondaryLinkClassName} href="/login">
                返回登录页
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--cma-page)]">
      <header className="border-b border-[var(--cma-line)] bg-[var(--cma-surface)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
          <div className="flex flex-wrap items-center gap-2">
            <Link className={navLinkClassName} href="/dashboard">
              工作台
            </Link>
            <Link className={navLinkClassName} href="/patients">
              患者档案
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-base text-[var(--cma-muted)]">
              当前用户：
              <strong className="font-semibold text-[var(--cma-text-strong)]">
                {user.displayName}
              </strong>
            </span>
            <Button
              disabled={isSigningOut}
              onClick={() => void handleSignOut()}
              size="sm"
              variant="secondary"
            >
              {isSigningOut ? '正在退出...' : '退出登录'}
            </Button>
          </div>
        </div>
      </header>
      <main className="px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
