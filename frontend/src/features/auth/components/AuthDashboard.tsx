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

const clinicalCapabilities = [
  {
    title: 'MMSE / MoCA 施测与原始证据',
    description: '支持逐题施测记录，以及图片、平板手写和原始作答证据。',
    status: '已接入',
    tone: 'success',
  },
  {
    title: '评分复核与认知域结果',
    description: '支持阶段性评分、人工复核、评分确认和认知域结果查看。',
    status: '已接入',
    tone: 'success',
  },
  {
    title: '报告工作流与历史趋势',
    description:
      '支持临床报告生成、编辑、提交确认、锁定、来源冻结、归档，以及历史版本和单量表随访趋势。',
    status: '已接入',
    tone: 'success',
  },
  {
    title: '科研导出',
    description: '科研脱敏导出尚未实现，仍处于规划中。',
    status: '规划中',
    tone: 'neutral',
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
              当前工作台提供患者档案入口；MMSE / MoCA
              施测、评分复核、临床报告与历史趋势已接入患者与访视工作流。
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

      <section aria-labelledby="available-capabilities-title">
        <div className="mb-4">
          <h2
            className="text-2xl font-semibold text-[var(--cma-text-strong)]"
            id="available-capabilities-title"
          >
            已接入能力
          </h2>
          <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
            可进入患者档案，查看或创建患者 / 受试者档案并建立评估访视。
          </p>
        </div>
        <Card>
          <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-2">
              <Badge tone="success">已接入</Badge>
              <CardTitle className="text-xl">患者档案</CardTitle>
              <CardDescription>
                查看患者 / 受试者档案并建立评估访视。
              </CardDescription>
            </div>
            <Link className={linkClassName} href="/patients">
              进入患者档案
            </Link>
          </CardHeader>
        </Card>
      </section>

      <section aria-labelledby="clinical-capabilities-title">
        <div className="mb-4">
          <h2
            className="text-2xl font-semibold text-[var(--cma-text-strong)]"
            id="clinical-capabilities-title"
          >
            临床能力概览
          </h2>
          <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
            以下能力已通过患者档案与访视流程接入；科研导出仍处于规划中。
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {clinicalCapabilities.map((capability) => (
            <Card key={capability.title}>
              <CardHeader>
                <Badge tone={capability.tone}>{capability.status}</Badge>
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
