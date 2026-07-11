'use client';

import { useEffect, useState } from 'react';

import { Badge, type BadgeTone } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import { ScaleSubmissionIssueList } from '@/src/features/assessments/components/ScaleSubmissionIssueList';
import {
  scaleSubmissionDurationSourceLabels,
  scaleSubmissionStateLabels,
} from '@/src/features/assessments/lib/scale-instance-submission-display';
import type {
  ScaleInstanceSubmissionAudit,
  ScaleSubmissionIssue,
  ScaleSubmissionReadinessResponse,
  ScaleSubmissionState,
} from '@/src/features/assessments/types/scale-instance-submission';
import { assessmentOperatorRoleLabels } from '@/src/features/assessments/lib/assessment-execution-display';
import { formatDateTime } from '@/src/features/patients/lib/patient-display';

const stateTones: Record<ScaleSubmissionState, BadgeTone> = {
  editable: 'info',
  incomplete: 'warning',
  ready: 'success',
  completed: 'success',
  locked: 'warning',
  voided: 'warning',
  patient_inactive: 'warning',
  visit_not_editable: 'warning',
};

type Statistic = {
  label: string;
  value: number;
};

export function ScaleInstanceSubmissionPanel({
  activeAnswerWriteCount,
  activeMediaWriteCount,
  completedAt,
  confirmationVisible,
  localUnsavedAnswerCount,
  onConfirmSubmit,
  onLocateIssue,
  onPrepareSubmit,
  onRefresh,
  pendingMediaCount,
  readOnlyReason,
  readiness,
  readinessError,
  readinessLoading,
  readinessStale,
  statusMessage,
  submissionError,
  submissionReceipt,
  submitting,
}: {
  activeAnswerWriteCount: number;
  activeMediaWriteCount: number;
  completedAt: string | null;
  confirmationVisible: boolean;
  localUnsavedAnswerCount: number;
  onConfirmSubmit: () => void;
  onLocateIssue: (issue: ScaleSubmissionIssue) => void;
  onPrepareSubmit: () => void;
  onRefresh: () => void;
  pendingMediaCount: number;
  readOnlyReason: string | null;
  readiness: ScaleSubmissionReadinessResponse | null;
  readinessError: string | null;
  readinessLoading: boolean;
  readinessStale: boolean;
  statusMessage: string | null;
  submissionError: string | null;
  submissionReceipt: ScaleInstanceSubmissionAudit | null;
  submitting: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setConfirmed(false);
  }, [
    activeAnswerWriteCount,
    activeMediaWriteCount,
    confirmationVisible,
    localUnsavedAnswerCount,
    pendingMediaCount,
    readiness?.checkedAt,
    readinessStale,
    submitting,
  ]);

  const localBlockCount =
    localUnsavedAnswerCount +
    pendingMediaCount +
    activeAnswerWriteCount +
    activeMediaWriteCount;
  const isHistoricalState =
    readiness?.submissionState === 'completed' ||
    readiness?.submissionState === 'locked' ||
    readiness?.submissionState === 'voided';
  const isExternallyUnsubmittable =
    readiness?.submissionState === 'patient_inactive' ||
    readiness?.submissionState === 'visit_not_editable';
  const confirmationBlocked =
    readinessStale ||
    readinessLoading ||
    localBlockCount > 0 ||
    !readiness?.ready ||
    !readiness.canSubmitNow ||
    readiness.blockingIssues.length > 0;
  const statistics: Statistic[] = readiness
    ? [
        { label: '预期题目', value: readiness.summary.expectedItemCount },
        { label: '实际题目', value: readiness.summary.actualItemCount },
        { label: '已完成题目', value: readiness.summary.completedItemCount },
        { label: '未完成题目', value: readiness.summary.incompleteItemCount },
        { label: '缺失题目', value: readiness.summary.missingItemCount },
        {
          label: '需要媒体的题目',
          value: readiness.summary.requiredMediaItemCount,
        },
        {
          label: '媒体要求已满足',
          value: readiness.summary.satisfiedMediaItemCount,
        },
        { label: '阻断问题', value: readiness.summary.blockingIssueCount },
        { label: '警告', value: readiness.summary.warningCount },
      ]
    : [];

  return (
    <Card>
      <CardHeader className="border-b border-[var(--cma-line)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>量表提交检查</CardTitle>
            <CardDescription>
              检查只反映服务器已保存的数据；正式提交不会自动评分或完成访视。
            </CardDescription>
          </div>
          {readiness ? (
            <Badge tone={stateTones[readiness.submissionState]}>
              {scaleSubmissionStateLabels[readiness.submissionState]}
            </Badge>
          ) : (
            <Badge>尚未取得检查结果</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 pt-5">
        {readinessLoading && !readiness ? (
          <p aria-live="polite" role="status" className="text-[var(--cma-info)]">
            正在检查服务器提交条件...
          </p>
        ) : null}

        {readinessError ? (
          <div
            className="grid gap-3 rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-[var(--cma-danger)]"
            role="alert"
          >
            <p>{readinessError}</p>
            <div>
              <Button
                disabled={readinessLoading}
                onClick={onRefresh}
                size="sm"
                variant="secondary"
              >
                {readinessLoading ? '正在重新检查...' : '重试检查'}
              </Button>
            </div>
          </div>
        ) : null}

        {readiness ? (
          <>
            <div className="flex flex-wrap gap-2" aria-live="polite">
              <Badge tone={readiness.ready ? 'success' : 'warning'}>
                完整性：{readiness.ready ? '已通过' : '未通过'}
              </Badge>
              <Badge tone={readiness.canSubmitNow ? 'success' : 'warning'}>
                当前可提交：{readiness.canSubmitNow ? '是' : '否'}
              </Badge>
              <Badge tone={readinessStale ? 'warning' : 'success'}>
                {readinessStale ? '检查结果已过期' : '检查结果为最新'}
              </Badge>
              <span className="self-center text-sm text-[var(--cma-muted)]">
                检查时间：{formatDateTime(readiness.checkedAt)}
              </span>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {statistics.map((statistic) => (
                <div
                  className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-3"
                  key={statistic.label}
                >
                  <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                    {statistic.label}
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold text-[var(--cma-text-strong)]">
                    {statistic.value}
                  </dd>
                </div>
              ))}
            </dl>

            <section className="grid gap-3" aria-labelledby="blocking-issues-title">
              <h3
                className="text-lg font-semibold text-[var(--cma-text-strong)]"
                id="blocking-issues-title"
              >
                阻断问题（{readiness.blockingIssues.length}）
              </h3>
              <ScaleSubmissionIssueList
                issues={readiness.blockingIssues}
                onLocateIssue={onLocateIssue}
                severity="blocking"
              />
            </section>

            <details className="rounded-md border border-[var(--cma-line)] p-4">
              <summary className="cursor-pointer font-semibold text-[var(--cma-text-strong)]">
                警告（{readiness.warnings.length}，不阻断提交）
              </summary>
              <div className="mt-3">
                <ScaleSubmissionIssueList
                  issues={readiness.warnings}
                  onLocateIssue={onLocateIssue}
                  severity="warning"
                />
              </div>
            </details>
          </>
        ) : null}

        {localBlockCount > 0 ? (
          <div className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-[var(--cma-warning)]" role="status">
            <p className="font-semibold">
              存在尚未持久化的本地内容，不能正式提交。
            </p>
            <p className="mt-1 text-sm leading-6">
              未保存作答 {localUnsavedAnswerCount} 题、未上传证据 {pendingMediaCount}
              题、题目保存请求 {activeAnswerWriteCount} 个、媒体写请求
              {activeMediaWriteCount} 个。服务器检查不包含这些本地内容，请先完成保存或上传。
            </p>
          </div>
        ) : null}

        {readinessStale ? (
          <p
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4 text-[var(--cma-warning)]"
            role="status"
          >
            提交检查结果已过期，请重新检查。旧结果仅供参考，不能用于正式提交。
          </p>
        ) : null}

        {statusMessage ? (
          <p
            aria-live="polite"
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] p-4 text-[var(--cma-info)]"
            role="status"
          >
            {statusMessage}
          </p>
        ) : null}

        {submissionError ? (
          <p
            className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] p-4 text-[var(--cma-danger)]"
            role="alert"
          >
            {submissionError}
          </p>
        ) : null}

        {submitting ? (
          <p aria-live="polite" role="status" className="font-semibold text-[var(--cma-info)]">
            正在正式提交量表实例，请勿重复操作...
          </p>
        ) : null}

        {submissionReceipt ? (
          <section className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] p-4" aria-labelledby="submission-receipt-title">
            <h3
              className="font-semibold text-[var(--cma-success)]"
              id="submission-receipt-title"
            >
              {submissionReceipt.alreadySubmitted
                ? '该量表实例此前已经提交，本次未重复写入'
                : '提交成功'}
            </h3>
            <dl className="mt-3 grid gap-2 text-sm text-[var(--cma-text-strong)] sm:grid-cols-2">
              <div>
                <dt className="font-semibold">提交时间</dt>
                <dd>{formatDateTime(submissionReceipt.submittedAt)}</dd>
              </div>
              <div>
                <dt className="font-semibold">提交操作者</dt>
                <dd>
                  {submissionReceipt.submittedBy?.operatorName || '未提供'}
                  {submissionReceipt.submittedBy?.operatorRole
                    ? `（${assessmentOperatorRoleLabels[submissionReceipt.submittedBy.operatorRole]}）`
                    : ''}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">用时来源</dt>
                <dd>
                  {scaleSubmissionDurationSourceLabels[
                    submissionReceipt.durationSource
                  ]}
                </dd>
              </div>
              {submissionReceipt.submissionId ? (
                <div className="text-[var(--cma-muted)]">
                  <dt className="font-semibold">内部回执摘要</dt>
                  <dd className="break-all">{submissionReceipt.submissionId}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : readiness?.submissionState === 'completed' ? (
          <section className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4">
            <p className="font-semibold text-[var(--cma-text-strong)]">
              该量表实例已完成提交。
            </p>
            <p className="mt-1 text-sm text-[var(--cma-muted)]">
              完成时间：{formatDateTime(completedAt)}。当前只读接口未提供历史提交操作者。
            </p>
          </section>
        ) : null}

        {readOnlyReason && readiness?.submissionState !== 'completed' ? (
          <p className="text-sm leading-6 text-[var(--cma-muted)]">
            {readOnlyReason}仍可查看提交检查、作答和历史证据。
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3 border-t border-[var(--cma-line)] pt-4">
          <Button
            disabled={readinessLoading || submitting}
            onClick={onRefresh}
            variant="secondary"
          >
            {readinessLoading ? '正在检查...' : '重新检查提交条件'}
          </Button>
          {!readinessError &&
          !isHistoricalState &&
          !isExternallyUnsubmittable &&
          !readOnlyReason ? (
            <Button
              disabled={readinessLoading || submitting}
              onClick={onPrepareSubmit}
            >
              {readinessLoading ? '正在检查...' : '检查并准备提交'}
            </Button>
          ) : null}
        </div>

        {confirmationVisible ? (
          <section className="grid gap-4 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4" aria-labelledby="submission-confirmation-title">
            <div>
              <h3
                className="text-lg font-semibold text-[var(--cma-warning)]"
                id="submission-confirmation-title"
              >
                确认正式提交
              </h3>
              <ul className="mt-2 grid gap-1 text-sm leading-6 text-[var(--cma-text-strong)]">
                <li>实例将标记为已完成。</li>
                <li>题目草稿和媒体将变为只读。</li>
                <li>本阶段不会自动评分。</li>
                <li>访视不会自动完成。</li>
                <li>当前有 {readiness?.warnings.length ?? 0} 条不阻断警告，可在上方展开查看。</li>
              </ul>
            </div>
            <div className="flex items-start gap-3">
              <input
                checked={confirmed}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)]"
                disabled={submitting || confirmationBlocked}
                id="confirm-scale-instance-submission"
                onChange={(event) => setConfirmed(event.target.checked)}
                type="checkbox"
              />
              <label
                className="font-semibold text-[var(--cma-text-strong)]"
                htmlFor="confirm-scale-instance-submission"
              >
                我已核对以上影响，并确认正式提交该量表实例。
              </label>
            </div>
            <div>
              <Button
                disabled={!confirmed || submitting || confirmationBlocked}
                onClick={onConfirmSubmit}
              >
                {submitting ? '正在正式提交...' : '确认正式提交'}
              </Button>
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
