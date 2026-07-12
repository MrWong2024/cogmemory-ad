import type { ClinicalReportNarrative as ClinicalReportNarrativeValue } from '@/src/features/assessments/types/clinical-report';
import type { ClinicalReportStatus } from '@/src/features/assessments/types/clinical-report';

const narrativeFields: Array<{
  key: keyof ClinicalReportNarrativeValue;
  title: string;
}> = [
  { key: 'chiefSummary', title: '报告草稿概述' },
  { key: 'scoreSummary', title: '评分摘要说明' },
  { key: 'domainSummary', title: '认知域摘要说明' },
  { key: 'evidenceSummary', title: '证据摘要说明' },
  { key: 'limitations', title: '局限性与使用边界' },
];

export function ClinicalReportNarrative({
  narrative,
  status,
}: {
  narrative: ClinicalReportNarrativeValue | null;
  status: ClinicalReportStatus;
}) {
  return (
    <section aria-labelledby="clinical-report-narrative-heading" className="grid gap-3">
      <div>
        <h3
          className="text-xl font-semibold text-[var(--cma-text-strong)]"
          id="clinical-report-narrative-heading"
        >
          服务端规则化正文
        </h3>
        <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
          以下五段按普通文本只读展示，由服务端固定规则生成，不是医生意见，也不能在本页面编辑。
        </p>
      </div>
      {narrative ? (
        <div className="grid gap-3">
          {narrativeFields.map((field) => (
            <section
              className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4"
              key={field.key}
            >
              <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
                {field.title}
              </h4>
              <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-[var(--cma-text-strong)]">
                {narrative[field.key]?.trim() ||
                  '当前报告未提供该规则化段落。'}
              </p>
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4 text-base text-[var(--cma-muted)]">
          当前安全响应未提供规则化正文。
        </p>
      )}

      <section
        aria-labelledby="clinical-report-clinician-narrative-heading"
        className="mt-3 grid gap-3 rounded-md border border-[var(--cma-line-strong)] p-4"
      >
        <div>
          <h3
            className="text-xl font-semibold text-[var(--cma-text-strong)]"
            id="clinical-report-clinician-narrative-heading"
          >
            临床人员明确填写内容
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
            {status === 'draft'
              ? '以下内容尚未提交医生确认。'
              : status === 'pending_confirmation'
                ? '以下内容已提交，等待医生或管理员确认。'
                : status === 'voided'
                  ? '以下为历史作废内容，只读展示。'
                  : '以下内容已纳入确认报告，只读展示。'}{' '}
            系统不自动生成、改写、审核或解释临床人员文本。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
            <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
              临床人员补充意见
            </h4>
            <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-[var(--cma-text-strong)]">
              {narrative?.doctorOpinion?.trim() || '尚未填写。'}
            </p>
          </section>
          <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
            <h4 className="text-lg font-semibold text-[var(--cma-text-strong)]">
              临床人员补充建议
            </h4>
            <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-[var(--cma-text-strong)]">
              {narrative?.recommendationText?.trim() || '尚未填写。'}
            </p>
          </section>
        </div>
      </section>
    </section>
  );
}
