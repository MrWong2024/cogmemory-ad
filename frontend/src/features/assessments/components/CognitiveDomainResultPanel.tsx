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
  cognitiveDomainInterpretationStatements,
  cognitiveDomainNonDiagnosticStatements,
  cognitiveDomainQualityStatusLabels,
  cognitiveDomainResultStatusBadgeLabels,
  cognitiveDomainResultStatusLabels,
  formatCognitiveDomainSourceScoreSummary,
  getCognitiveDomainApiErrorMessage,
  type CognitiveDomainSourceScoreSummary,
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
    <details className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4 text-base leading-7 text-[var(--cma-text-strong)]">
      <summary className="cursor-pointer font-semibold">
        认知域结果如何解释
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--cma-muted)]">
        {cognitiveDomainInterpretationStatements.map((statement) => (
          <li key={statement}>{statement}</li>
        ))}
      </ul>
    </details>
  );
}

function CognitiveDomainLocalSafetyBlock({ reason }: { reason: string }) {
  return (
    <div
      className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-base leading-7 text-[var(--cma-warning)]"
      role="status"
    >
      <p className="font-semibold">本地安全阻断</p>
      <p className="mt-1">{reason}</p>
    </div>
  );
}

export function CognitiveDomainResultPanel({
  state,
  sourceScoreSummary,
  canLocateItem,
  onLocateItem,
}: {
  state: UseCognitiveDomainResultValue;
  sourceScoreSummary: CognitiveDomainSourceScoreSummary | null;
  canLocateItem: (itemResponseId: string) => boolean;
  onLocateItem: (itemResponseId: string) => void;
}) {
  const result = state.detail?.cognitiveDomainResult ?? null;
  const sourceScoreLabel = formatCognitiveDomainSourceScoreSummary(
    sourceScoreSummary,
  );
  const localSafetyBlockVisible =
    state.localBlockReason !== null &&
    (state.status === 'waiting_for_score' ||
      state.status === 'loading' ||
      state.status === 'not_found');
  const resultStatusTone =
    result?.status === 'computed' || result?.status === 'confirmed'
      ? 'success'
      : result?.status === 'draft'
        ? 'info'
        : 'warning';
  const showQualityWarning =
    result?.qualityStatus === 'needs_review' ||
    result?.qualityStatus === 'failed';

  return (
    <Card>
      <CardHeader className="border-b border-[var(--cma-line)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge tone="info">认知域结果</Badge>
            <CardTitle className="mt-3">认知域分析</CardTitle>
            <CardDescription>
              基于已最终确认的评分结果和量表既定认知域映射生成分析。页面不会自动生成，现阶段也不支持重新生成。
            </CardDescription>
          </div>
          {state.status === 'loaded' ? (
            <Button
              disabled={state.computing}
              onClick={() => void state.refreshLatest()}
              type="button"
              variant="secondary"
            >
              刷新认知域结果
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="grid min-w-0 max-w-full gap-5 pt-5 [&>*]:min-w-0">
        <div aria-live="polite">
          {localSafetyBlockVisible && state.localBlockReason ? (
            <CognitiveDomainLocalSafetyBlock reason={state.localBlockReason} />
          ) : null}
          {state.status === 'idle' ? (
            <p className="text-base text-[var(--cma-muted)]">
              认知域状态尚未初始化。
            </p>
          ) : null}
          {state.status === 'waiting_for_score' &&
          !localSafetyBlockVisible ? (
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
          {state.status === 'loading' && !localSafetyBlockVisible ? (
            <p className="text-base text-[var(--cma-muted)]" role="status">
              正在加载认知域结果…
            </p>
          ) : null}
          {state.liveMessage && state.alreadyComputedReceipt !== true ? (
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
              重试加载认知域结果
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
                刷新认知域结果
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
            重试加载认知域结果
          </Button>
        ) : null}

        {state.status === 'not_found' ? (
          <section className="rounded-md border border-[var(--cma-line)] p-4">
            <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
              尚未生成认知域结果
            </h3>
            <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
              系统将基于已最终确认的评分结果和量表既定认知域映射生成分析。结果生成后现阶段不支持重新生成。
            </p>
            {state.canCompute || state.computing ? (
              <Button
                className="mt-4"
                disabled={state.computing || !state.canCompute}
                onClick={() => void state.compute()}
                type="button"
              >
                {state.computing
                  ? '正在生成认知域结果...'
                  : '生成认知域结果'}
              </Button>
            ) : !localSafetyBlockVisible ? (
              <p className="mt-3 text-base leading-7 text-[var(--cma-muted)]">
                {state.computeBlockReason}
              </p>
            ) : null}
          </section>
        ) : null}

        {!result ? (
          <>
            <CognitiveDomainSafetyBoundary />
            <OverlappingAttributionNotice />
          </>
        ) : null}

        {result && state.detail ? (
          <div className="grid min-w-0 max-w-full gap-6 [&>*]:min-w-0">
            <section className="rounded-md border border-[var(--cma-line)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-[var(--cma-text-strong)]">
                    {cognitiveDomainResultStatusLabels[result.status]}
                  </h3>
                  {sourceScoreLabel ? (
                    <p className="mt-2 text-base font-semibold leading-7 text-[var(--cma-text-strong)]">
                      {sourceScoreLabel}
                    </p>
                  ) : null}
                </div>
                <Badge tone={resultStatusTone}>
                  {cognitiveDomainResultStatusBadgeLabels[result.status]}
                </Badge>
              </div>
              {showQualityWarning ? (
                <p
                  className="mt-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-3 text-base leading-7 text-[var(--cma-warning)]"
                  role="alert"
                >
                  {cognitiveDomainQualityStatusLabels[result.qualityStatus]}
                </p>
              ) : null}
              {state.alreadyComputedReceipt === true ? (
                <p className="mt-3 font-semibold text-[var(--cma-primary)]">
                  该量表已有认知域结果，本次未重复生成。
                </p>
              ) : null}
            </section>

            <CognitiveDomainScoreList scores={result.domainScores} />
            <CognitiveDomainSafetyBoundary />
            <CognitiveDomainContributionList
              canLocateItem={canLocateItem}
              contributions={result.itemContributions}
              onLocateItem={onLocateItem}
            />
            <OverlappingAttributionNotice />
            <CognitiveDomainMappingSummary detail={state.detail} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
