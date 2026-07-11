import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import { CognitiveDomainContributionList } from '@/src/features/assessments/components/CognitiveDomainContributionList';
import { CognitiveDomainMappingSummary } from '@/src/features/assessments/components/CognitiveDomainMappingSummary';
import { CognitiveDomainScoreList } from '@/src/features/assessments/components/CognitiveDomainScoreList';
import type { UseCognitiveDomainResultValue } from '@/src/features/assessments/hooks/useCognitiveDomainResult';
import {
  cognitiveDomainNonDiagnosticStatements,
  cognitiveDomainQualityStatusLabels,
  cognitiveDomainResultStatusLabels,
  getCognitiveDomainApiErrorMessage,
} from '@/src/features/assessments/lib/cognitive-domain-display';

function CognitiveDomainSafetyBoundary() {
  return (
    <div className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] p-4 text-base leading-7 text-[var(--cma-info)]">
      {cognitiveDomainNonDiagnosticStatements.map((statement) => (
        <p className="mt-1 first:mt-0" key={statement}>
          {statement}
        </p>
      ))}
    </div>
  );
}

function OverlappingAttributionNotice() {
  return (
    <div className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4 text-base leading-7 text-[var(--cma-text-strong)]">
      <p className="font-semibold">重叠归因说明</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--cma-muted)]">
        <li>一个项目可以归入多个认知域。</li>
        <li>每个认知域获得该项目的完整分值，不进行平均拆分。</li>
        <li>认知域之间可能存在重叠。</li>
        <li>各认知域分数不可相加解释为量表总分。</li>
      </ul>
    </div>
  );
}

export function CognitiveDomainResultPanel({
  state,
  canLocateItem,
  onLocateItem,
}: {
  state: UseCognitiveDomainResultValue;
  canLocateItem: (itemResponseId: string) => boolean;
  onLocateItem: (itemResponseId: string) => void;
}) {
  const result = state.detail?.cognitiveDomainResult ?? null;

  return (
    <Card>
      <CardHeader className="border-b border-[var(--cma-line)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge tone="info">认知域结果</Badge>
            <CardTitle className="mt-3">认知域计算与安全展示</CardTitle>
            <CardDescription>
              查询已有结果；无结果时仅在明确确认后首次计算。页面不自动计算，也不支持重算。
            </CardDescription>
          </div>
          {state.status === 'loaded' ? (
            <Button
              disabled={state.computing}
              onClick={() => void state.refreshLatest()}
              type="button"
              variant="secondary"
            >
              重新加载认知域结果
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="grid gap-5 pt-5">
        <CognitiveDomainSafetyBoundary />
        <OverlappingAttributionNotice />

        <div aria-live="polite">
          {state.status === 'idle' ? (
            <p className="text-base text-[var(--cma-muted)]">
              认知域状态尚未初始化。
            </p>
          ) : null}
          {state.status === 'waiting_for_score' ? (
            <div>
              <p className="text-base leading-7 text-[var(--cma-muted)]">
                {state.latestError
                  ? getCognitiveDomainApiErrorMessage(state.latestError.kind)
                  : state.dependencyMessage}
              </p>
              {state.latestError?.kind === 'score_result_not_found' ? (
                <Button
                  className="mt-3"
                  onClick={state.refreshSourceScoreResult}
                  type="button"
                  variant="secondary"
                >
                  重新加载来源评分
                </Button>
              ) : null}
            </div>
          ) : null}
          {state.status === 'loading' ? (
            <p className="text-base text-[var(--cma-muted)]" role="status">
              正在加载认知域结果…
            </p>
          ) : null}
          {state.liveMessage ? (
            <p className="font-semibold text-[var(--cma-primary)]">
              {state.liveMessage}
            </p>
          ) : null}
        </div>

        {state.latestError &&
        state.status !== 'waiting_for_score' &&
        state.status !== 'not_found' ? (
          <div
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-base leading-7 text-[var(--cma-warning)]"
            role="alert"
          >
            <p>{getCognitiveDomainApiErrorMessage(state.latestError.kind)}</p>
            <Button
              className="mt-3"
              disabled={state.status === 'loading'}
              onClick={() => void state.refreshLatest()}
              type="button"
              variant="secondary"
            >
              手工重试认知域查询
            </Button>
          </div>
        ) : null}

        {state.computeError ? (
          <div
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-base leading-7 text-[var(--cma-warning)]"
            role="alert"
          >
            <p>{getCognitiveDomainApiErrorMessage(state.computeError.kind)}</p>
            {state.canRefreshSourceScore ? (
              <Button
                className="mt-3"
                onClick={state.refreshSourceScoreResult}
                type="button"
                variant="secondary"
              >
                重新加载来源评分
              </Button>
            ) : null}
            {state.computeError.kind !== 'forbidden' ? (
              <Button
                className="mt-3 ml-3"
                onClick={() => void state.refreshLatest()}
                type="button"
                variant="secondary"
              >
                重新查询认知域结果
              </Button>
            ) : null}
          </div>
        ) : null}

        {state.status === 'forbidden' ? (
          <p className="text-base leading-7 text-[var(--cma-muted)]">
            认知域区域保持独立无权限状态；题目、媒体、提交和评分历史仍可继续查看。
          </p>
        ) : null}

        {state.status === 'error' && !state.latestError ? (
          <Button
            onClick={() => void state.refreshLatest()}
            type="button"
            variant="secondary"
          >
            手工重试认知域查询
          </Button>
        ) : null}

        {state.status === 'not_found' ? (
          <section className="rounded-md border border-[var(--cma-line)] p-4">
            <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
              尚未计算认知域结果
            </h3>
            <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
              latest 查询确认当前没有 runNo=1 认知域结果。首次计算不会在页面加载时自动发送。
            </p>
            {state.canPrepareCompute ? (
              <Button
                className="mt-4"
                onClick={state.prepareCompute}
                type="button"
              >
                准备计算认知域结果
              </Button>
            ) : (
              <p className="mt-3 text-base leading-7 text-[var(--cma-muted)]">
                {state.computeBlockReason}
              </p>
            )}
          </section>
        ) : null}

        {state.confirmationOpen ? (
          <section className="rounded-md border border-[var(--cma-line-strong)] p-4">
            <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
              确认首次计算口径
            </h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-7 text-[var(--cma-muted)]">
              <li>计算基于已经确认的评分结果。</li>
              <li>不会重新读取原始作答进行评分。</li>
              <li>同一题目可将完整分值分别归入多个认知域。</li>
              <li>认知域之间可能存在重叠，不能跨域求和解释为量表总分。</li>
              <li>scorePercent 只是映射项目得分比例。</li>
              <li>scorePercent 不是正常率、疾病概率或风险值。</li>
              <li>本次只生成 computed 认知域结果。</li>
              <li>结果尚未独立确认或锁定。</li>
              <li>当前不生成报告或诊断结论。</li>
              <li>A19 不支持重算。</li>
            </ul>
            <label className="mt-4 flex items-start gap-3 text-base leading-7 text-[var(--cma-text-strong)]">
              <input
                checked={state.confirmationChecked}
                className="mt-1 h-5 w-5"
                disabled={state.computing}
                onChange={(event) =>
                  state.setConfirmationChecked(event.target.checked)
                }
                type="checkbox"
              />
              <span>
                我已核对上述重叠归因与非诊断边界，并确认首次计算认知域结果。
              </span>
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                disabled={
                  !state.confirmationChecked ||
                  state.computing ||
                  !state.canPrepareCompute
                }
                onClick={() => void state.confirmCompute()}
                type="button"
              >
                {state.computing
                  ? '正在计算认知域结果'
                  : '确认计算认知域结果'}
              </Button>
              <Button
                disabled={state.computing}
                onClick={state.cancelCompute}
                type="button"
                variant="secondary"
              >
                取消
              </Button>
            </div>
          </section>
        ) : null}

        {result && state.detail ? (
          <div className="grid gap-6">
            <section className="rounded-md border border-[var(--cma-line)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
                    {cognitiveDomainResultStatusLabels[result.status]}
                  </h3>
                  <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
                    服务端 isFinal：{result.isFinal ? 'true' : 'false'}。
                    computed 不等于 confirmed，confirmed 也不等于 locked。
                  </p>
                </div>
                <Badge tone={result.isFinal ? 'success' : 'info'}>
                  {result.isFinal ? '服务端标记为最终结果' : '尚未独立确认'}
                </Badge>
              </div>
              <p className="mt-3 text-base text-[var(--cma-muted)]">
                质量处理状态：
                {cognitiveDomainQualityStatusLabels[result.qualityStatus]}
              </p>
              {state.alreadyComputedReceipt !== null ? (
                <p className="mt-3 font-semibold text-[var(--cma-primary)]">
                  {state.alreadyComputedReceipt
                    ? '该实例此前已经生成认知域结果，本次未重复计算。'
                    : '认知域结果计算完成；结果尚未独立确认。'}
                </p>
              ) : null}
            </section>

            <CognitiveDomainScoreList scores={result.domainScores} />
            <CognitiveDomainContributionList
              canLocateItem={canLocateItem}
              contributions={result.itemContributions}
              onLocateItem={onLocateItem}
            />
            <CognitiveDomainMappingSummary detail={state.detail} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
