// frontend/app/page.tsx
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
    description: '后续承载认知评估发起、任务流转与临床记录入口。',
  },
  {
    title: '记录',
    description: '后续承载评估过程、随访信息与可追溯操作记录。',
  },
  {
    title: '报告',
    description: '后续承载报告生成、医生审核与结果查看流程。',
  },
  {
    title: '医生工作流',
    description: '后续围绕医生查看、评估、记录和报告协同展开。',
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
                <Badge tone="info">公共底座</Badge>
                <Badge tone="neutral">静态首页</Badge>
                <Badge tone="success">无 API 调用</Badge>
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
                面向临床认知评估的低干扰工作台。当前处于 MVP
                公共底座阶段，业务能力将在后续任务中按边界逐步实现。
              </p>
            </div>
            <div className="w-full border-l-4 border-[var(--cma-line-strong)] pl-5 lg:max-w-sm">
              <p className="text-sm font-semibold text-[var(--cma-primary)]">
                当前范围
              </p>
              <p className="mt-3 text-base leading-7 text-[var(--cma-muted)]">
                首页、404、全局样式、公共工具和基础 UI 组件已就位；真实登录、评估、记录、报告与患者作答流程尚未实现。
              </p>
            </div>
          </div>
        </section>

        <section aria-label="后续工作流入口" className="grid gap-4 sm:grid-cols-2">
          {workflowItems.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-[var(--cma-primary)]">
                  待业务阶段实现
                </span>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
