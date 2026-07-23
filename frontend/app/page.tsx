// frontend/app/page.tsx
import Link from 'next/link';

import { Badge } from '@/src/components/ui/Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';

const workflowItems = [
  {
    title: '评估',
    description:
      '支持医护或研究人员陪伴或监督完成 MMSE / MoCA 施测与规范记录。',
  },
  {
    title: '原始证据',
    description: '支持逐题原始作答、图片和平板手写证据的可追溯记录。',
  },
  {
    title: '评分与认知域',
    description: '支持阶段性评分、人工复核、评分确认和认知域结果查看。',
  },
  {
    title: '报告与随访',
    description: '支持临床报告工作流、历史报告版本和单量表随访趋势。',
  },
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <section className="border-b border-[var(--cma-line)] pb-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge tone="info">临床评估</Badge>
                <Badge tone="neutral">规范记录</Badge>
                <Badge tone="success">过程可追溯</Badge>
              </div>
              <p className="text-base font-semibold text-[var(--cma-primary)]">
                CogMemory AD
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-normal text-[var(--cma-text-strong)] sm:text-5xl">
                智忆评
              </h1>
              <p className="mt-4 max-w-2xl text-xl leading-8 text-[var(--cma-muted)]">
                阿尔茨海默病认知评估与辅助诊断系统
              </p>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-[var(--cma-text)]">
                面向临床与科研场景的认知评估工作空间，支持患者档案、评估访视、MMSE
                / MoCA
                施测、原始证据记录、评分复核、临床报告与历史随访。
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-[var(--cma-primary)] bg-[var(--cma-primary)] px-5 py-2.5 text-lg font-semibold text-white transition-colors hover:bg-[var(--cma-primary-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]"
                  href="/login"
                >
                  进入登录
                </Link>
                <Link
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-5 py-2.5 text-lg font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]"
                  href="/dashboard"
                >
                  进入工作台
                </Link>
              </div>
            </div>
            <div className="w-full border-l-4 border-[var(--cma-line-strong)] pl-5 lg:max-w-sm">
              <p className="text-sm font-semibold text-[var(--cma-primary)]">
                当前范围
              </p>
              <p className="mt-3 text-base leading-7 text-[var(--cma-muted)]">
                核心认知量表由医护或研究人员陪伴或监督完成；系统提供过程记录、评分复核和临床报告工作流，不用于患者居家自测，也不自动形成诊断结论。
              </p>
            </div>
          </div>
        </section>

        <section aria-label="当前能力概览" className="grid gap-4 sm:grid-cols-2">
          {workflowItems.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-[var(--cma-primary)]">
                  当前已接入
                </span>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
