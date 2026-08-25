'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import {
  AssessmentExecutionApiError,
  deleteAssessmentVisit,
  updateAssessmentVisit,
  voidAssessmentVisit,
} from '@/src/features/assessments/api/assessment-execution-api';
import { assessmentOperatorRoleLabels } from '@/src/features/assessments/lib/assessment-execution-display';
import type {
  AssessmentVisitExecutionDetailResponse,
  VisitMaintenanceState,
} from '@/src/features/assessments/types/assessment-execution';
import {
  assessmentVisitTypeLabels,
  assessmentVisitTypes,
  formatDateTime,
  toAssessmentDateIso,
} from '@/src/features/patients/lib/patient-display';
import type {
  AssessmentVisit,
  AssessmentVisitType,
} from '@/src/features/patients/types/patient';

type MaintenanceAction = 'edit' | 'delete' | 'void';
type Feedback = { kind: 'success' | 'error' | 'info'; message: string };

const inputClassName =
  'min-h-12 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3.5 py-2.5 text-base text-[var(--cma-text-strong)] outline-none transition-colors placeholder:text-[var(--cma-subtle)] focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)]';

function toDateTimeLocalValue(value: string): string {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isAssessmentVisitType(value: string): value is AssessmentVisitType {
  return assessmentVisitTypes.some((visitType) => visitType === value);
}

function getGenericWriteErrorMessage(
  error: AssessmentExecutionApiError,
): string {
  if (error.kind === 'forbidden') {
    return '当前账号没有维护访视的权限。';
  }

  if (error.kind === 'validation') {
    return '请检查填写内容后重试。';
  }

  if (error.kind === 'request_outcome_uncertain') {
    return '请求结果暂时无法确认，系统未自动重试。请重新加载访视详情核对服务器状态。';
  }

  if (error.kind === 'service_unavailable') {
    return '访视维护服务暂时不可用，请稍后重试。';
  }

  return '访视维护失败，请重新加载详情后重试。';
}

export function AssessmentVisitMaintenancePanel({
  patientId,
  visitId,
  visit,
  maintenance,
  externalBusyReason,
  onDetailUpdated,
  onRefreshRequested,
  onWritingChange,
}: {
  patientId: string;
  visitId: string;
  visit: AssessmentVisit;
  maintenance: VisitMaintenanceState;
  externalBusyReason: string | null;
  onDetailUpdated: (detail: AssessmentVisitExecutionDetailResponse) => void;
  onRefreshRequested: () => void;
  onWritingChange: (action: MaintenanceAction | null) => void;
}) {
  const router = useRouter();
  const writingRef = useRef<MaintenanceAction | null>(null);
  const [activeMode, setActiveMode] = useState<MaintenanceAction | null>(null);
  const [writingAction, setWritingAction] = useState<MaintenanceAction | null>(
    null,
  );
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [visitCode, setVisitCode] = useState(visit.visitCode);
  const [visitType, setVisitType] = useState<AssessmentVisitType>(
    visit.visitType,
  );
  const [assessmentDate, setAssessmentDate] = useState(() =>
    toDateTimeLocalValue(visit.assessmentDate),
  );
  const [notes, setNotes] = useState(visit.notes ?? '');
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [voidConfirmed, setVoidConfirmed] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  useEffect(() => {
    setVisitCode(visit.visitCode);
    setVisitType(visit.visitType);
    setAssessmentDate(toDateTimeLocalValue(visit.assessmentDate));
    setNotes(visit.notes ?? '');
  }, [visit.assessmentDate, visit.notes, visit.visitCode, visit.visitType]);

  useEffect(() => {
    if (
      (activeMode === 'edit' && !maintenance.canEdit) ||
      (activeMode === 'delete' && !maintenance.canDelete) ||
      (activeMode === 'void' && !maintenance.canVoid)
    ) {
      setActiveMode(null);
      setDeleteConfirmed(false);
      setVoidConfirmed(false);
    }
  }, [activeMode, maintenance]);

  const isBusy = writingAction !== null || externalBusyReason !== null;

  function startWriting(action: MaintenanceAction): boolean {
    if (writingRef.current !== null || externalBusyReason !== null) {
      return false;
    }

    writingRef.current = action;
    setWritingAction(action);
    onWritingChange(action);
    setFeedback(null);
    return true;
  }

  function finishWriting(): void {
    writingRef.current = null;
    setWritingAction(null);
    onWritingChange(null);
  }

  function handleAuthOrOwnershipError(error: AssessmentExecutionApiError) {
    if (error.kind === 'unauthenticated') {
      router.replace('/login');
      return true;
    }

    if (
      error.kind === 'patient_not_found' ||
      error.kind === 'visit_not_found'
    ) {
      onRefreshRequested();
      setFeedback({
        kind: 'error',
        message: '当前访视已不存在或不再属于该患者，正在刷新详情。',
      });
      return true;
    }

    return false;
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!maintenance.canEdit || !startWriting('edit')) {
      return;
    }

    const normalizedVisitCode = visitCode.trim().toUpperCase();
    const normalizedNotes = notes.trim();
    const assessmentDateIso = toAssessmentDateIso(assessmentDate);

    if (!normalizedVisitCode || normalizedVisitCode.length > 80) {
      setFeedback({
        kind: 'error',
        message: '请输入不超过 80 个字符的访视编号。',
      });
      finishWriting();
      return;
    }

    if (!isAssessmentVisitType(visitType)) {
      setFeedback({ kind: 'error', message: '请选择有效的访视类型。' });
      finishWriting();
      return;
    }

    if (!assessmentDateIso) {
      setFeedback({ kind: 'error', message: '请输入有效的评估日期时间。' });
      finishWriting();
      return;
    }

    if (normalizedNotes.length > 2000) {
      setFeedback({ kind: 'error', message: '备注不能超过 2000 个字符。' });
      finishWriting();
      return;
    }

    try {
      const response = await updateAssessmentVisit(patientId, visitId, {
        visitCode: normalizedVisitCode,
        visitType,
        assessmentDate: assessmentDateIso,
        notes: normalizedNotes,
      });
      onDetailUpdated(response);
      setActiveMode(null);
      setFeedback({ kind: 'success', message: '访视信息已更新。' });
    } catch (requestError: unknown) {
      const error =
        requestError instanceof AssessmentExecutionApiError
          ? requestError
          : new AssessmentExecutionApiError('unknown');

      if (handleAuthOrOwnershipError(error)) {
        return;
      }

      if (error.kind === 'visit_not_editable') {
        onRefreshRequested();
        setFeedback({
          kind: 'error',
          message: '该访视已经进入评估流程，不能再编辑。',
        });
      } else if (error.kind === 'visit_code_conflict') {
        setFeedback({
          kind: 'error',
          message: '该访视编号已存在，请更换后重试。',
        });
      } else if (error.kind === 'visit_update_empty_patch') {
        setFeedback({
          kind: 'error',
          message: '请至少修改一个访视字段后再保存。',
        });
      } else {
        setFeedback({
          kind: 'error',
          message: getGenericWriteErrorMessage(error),
        });
      }
    } finally {
      finishWriting();
    }
  }

  async function handleDelete() {
    if (!maintenance.canDelete || !deleteConfirmed || !startWriting('delete')) {
      return;
    }

    try {
      await deleteAssessmentVisit(patientId, visitId);
      router.replace(`/patients/${encodeURIComponent(patientId)}`);
      router.refresh();
    } catch (requestError: unknown) {
      const error =
        requestError instanceof AssessmentExecutionApiError
          ? requestError
          : new AssessmentExecutionApiError('unknown');

      if (handleAuthOrOwnershipError(error)) {
        return;
      }

      if (error.kind === 'visit_not_deletable') {
        onRefreshRequested();
        setFeedback({
          kind: 'error',
          message:
            '该访视已经产生评估事实，不能删除；如确需停止使用，请作废访视。',
        });
      } else {
        setFeedback({
          kind: 'error',
          message: getGenericWriteErrorMessage(error),
        });
      }
    } finally {
      finishWriting();
    }
  }

  async function handleVoid() {
    const reason = voidReason.trim();

    if (
      !maintenance.canVoid ||
      !voidConfirmed ||
      reason.length < 3 ||
      reason.length > 500 ||
      !startWriting('void')
    ) {
      if (reason.length < 3 || reason.length > 500) {
        setFeedback({
          kind: 'error',
          message: '请输入 3 至 500 个字符的作废原因。',
        });
      }
      return;
    }

    try {
      const response = await voidAssessmentVisit(patientId, visitId, {
        confirm: true,
        reason,
      });
      onDetailUpdated(response);
      setActiveMode(null);
      setVoidConfirmed(false);
      setVoidReason('');
      setFeedback({
        kind: 'success',
        message: '访视已作废，既有量表、作答、证据和历史记录均已保留。',
      });
    } catch (requestError: unknown) {
      const error =
        requestError instanceof AssessmentExecutionApiError
          ? requestError
          : new AssessmentExecutionApiError('unknown');

      if (handleAuthOrOwnershipError(error)) {
        return;
      }

      if (error.kind === 'visit_not_voidable') {
        onRefreshRequested();
        setFeedback({
          kind: 'error',
          message: '当前访视应删除而不是作废，请刷新后核对维护资格。',
        });
      } else {
        setFeedback({
          kind: 'error',
          message: getGenericWriteErrorMessage(error),
        });
      }
    } finally {
      finishWriting();
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-[var(--cma-line)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>访视维护</CardTitle>
            <CardDescription>
              维护资格由服务器根据访视、量表、空白题目记录和患者施测会话统一判断。
            </CardDescription>
          </div>
          {writingAction ? <Badge tone="info">维护请求处理中</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 pt-5">
        {externalBusyReason ? (
          <p className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--cma-muted)]">
            {externalBusyReason}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {maintenance.canEdit ? (
            <Button
              disabled={isBusy}
              onClick={() => {
                setActiveMode(activeMode === 'edit' ? null : 'edit');
                setFeedback(null);
              }}
              variant="secondary"
            >
              编辑访视
            </Button>
          ) : null}
          {maintenance.canDelete ? (
            <Button
              disabled={isBusy}
              onClick={() => {
                setActiveMode(activeMode === 'delete' ? null : 'delete');
                setDeleteConfirmed(false);
                setFeedback(null);
              }}
              variant="secondary"
            >
              删除访视
            </Button>
          ) : null}
          {maintenance.canVoid ? (
            <Button
              disabled={isBusy}
              onClick={() => {
                setActiveMode(activeMode === 'void' ? null : 'void');
                setVoidConfirmed(false);
                setFeedback(null);
              }}
              variant="secondary"
            >
              作废访视
            </Button>
          ) : null}
          <Button
            disabled={writingAction !== null}
            onClick={onRefreshRequested}
            variant="ghost"
          >
            重新加载维护资格
          </Button>
        </div>

        {activeMode === 'edit' && maintenance.canEdit ? (
          <form
            className="grid gap-5 border-t border-[var(--cma-line)] pt-5"
            onSubmit={handleEditSubmit}
          >
            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2 font-semibold text-[var(--cma-text-strong)]">
                访视编号
                <input
                  className={inputClassName}
                  disabled={isBusy}
                  maxLength={80}
                  onChange={(event) => setVisitCode(event.target.value)}
                  required
                  value={visitCode}
                />
              </label>
              <label className="grid gap-2 font-semibold text-[var(--cma-text-strong)]">
                访视类型
                <select
                  className={inputClassName}
                  disabled={isBusy}
                  onChange={(event) => {
                    if (isAssessmentVisitType(event.target.value)) {
                      setVisitType(event.target.value);
                    }
                  }}
                  value={visitType}
                >
                  {assessmentVisitTypes.map((type) => (
                    <option key={type} value={type}>
                      {assessmentVisitTypeLabels[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 font-semibold text-[var(--cma-text-strong)] md:col-span-2">
                评估时间
                <input
                  className={inputClassName}
                  disabled={isBusy}
                  onChange={(event) => setAssessmentDate(event.target.value)}
                  required
                  type="datetime-local"
                  value={assessmentDate}
                />
              </label>
              <label className="grid gap-2 font-semibold text-[var(--cma-text-strong)] md:col-span-2">
                备注
                <textarea
                  className={`${inputClassName} min-h-32 resize-y`}
                  disabled={isBusy}
                  maxLength={2000}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  value={notes}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button disabled={isBusy} type="submit">
                {writingAction === 'edit' ? '正在保存...' : '保存修改'}
              </Button>
              <Button
                disabled={isBusy}
                onClick={() => setActiveMode(null)}
                type="button"
                variant="ghost"
              >
                取消
              </Button>
            </div>
          </form>
        ) : null}

        {activeMode === 'delete' && maintenance.canDelete ? (
          <div className="grid gap-4 border-t border-[var(--cma-line)] pt-5">
            <p className="text-base leading-7 text-[var(--cma-text-strong)]">
              当前访视没有需要保留的评估记录，可以永久删除。删除后无法恢复。
            </p>
            {maintenance.initializedScaleCount > 0 ? (
              <p className="rounded-md border border-[var(--cma-warning)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-text-strong)]">
                此访视包含 {maintenance.initializedScaleCount}{' '}
                个尚未开始的量表实例。删除访视时，这些量表实例及其空白题目记录也会一并删除。
              </p>
            ) : null}
            <label className="flex items-start gap-3 text-base leading-7 text-[var(--cma-text-strong)]">
              <input
                checked={deleteConfirmed}
                className="mt-1 h-5 w-5"
                disabled={isBusy}
                onChange={(event) => setDeleteConfirmed(event.target.checked)}
                type="checkbox"
              />
              我确认永久删除本次访视。
            </label>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={isBusy || !deleteConfirmed}
                onClick={() => void handleDelete()}
                variant="secondary"
              >
                {writingAction === 'delete' ? '正在删除...' : '确认删除访视'}
              </Button>
              <Button
                disabled={isBusy}
                onClick={() => setActiveMode(null)}
                variant="ghost"
              >
                取消
              </Button>
            </div>
          </div>
        ) : null}

        {activeMode === 'void' && maintenance.canVoid ? (
          <div className="grid gap-4 border-t border-[var(--cma-line)] pt-5">
            <p className="rounded-md border border-[var(--cma-warning)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-text-strong)]">
              作废不会删除已有量表、作答、证据和历史记录；原数据将保留用于追溯。
            </p>
            <label className="grid gap-2 font-semibold text-[var(--cma-text-strong)]">
              作废原因
              <textarea
                className={`${inputClassName} min-h-28 resize-y`}
                disabled={isBusy}
                maxLength={500}
                minLength={3}
                onChange={(event) => setVoidReason(event.target.value)}
                placeholder="请输入 3 至 500 个字符"
                value={voidReason}
              />
            </label>
            <label className="flex items-start gap-3 text-base leading-7 text-[var(--cma-text-strong)]">
              <input
                checked={voidConfirmed}
                className="mt-1 h-5 w-5"
                disabled={isBusy}
                onChange={(event) => setVoidConfirmed(event.target.checked)}
                type="checkbox"
              />
              我确认作废本次访视，并保留全部既有评估事实。
            </label>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={
                  isBusy || !voidConfirmed || voidReason.trim().length < 3
                }
                onClick={() => void handleVoid()}
                variant="secondary"
              >
                {writingAction === 'void' ? '正在作废...' : '确认作废访视'}
              </Button>
              <Button
                disabled={isBusy}
                onClick={() => setActiveMode(null)}
                variant="ghost"
              >
                取消
              </Button>
            </div>
          </div>
        ) : null}

        {visit.status === 'voided' ? (
          <div className="grid gap-4 border-t border-[var(--cma-line)] pt-5">
            <Badge tone="warning">访视已作废 · 只读</Badge>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  作废时间
                </dt>
                <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                  {formatDateTime(visit.voidedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  作废人员
                </dt>
                <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                  {visit.voidedBy?.operatorName || '未记录'}
                  {visit.voidedBy?.operatorRole
                    ? ` · ${assessmentOperatorRoleLabels[visit.voidedBy.operatorRole]}`
                    : ''}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  作废原因
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-base text-[var(--cma-text-strong)]">
                  {visit.voidReason || '未记录'}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {!maintenance.canEdit &&
        !maintenance.canDelete &&
        !maintenance.canVoid &&
        visit.status !== 'voided' ? (
          <p className="text-base leading-7 text-[var(--cma-muted)]">
            当前访视没有可用的维护操作。
          </p>
        ) : null}

        {feedback ? (
          <p
            className={
              feedback.kind === 'error'
                ? 'rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-danger)]'
                : 'rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] px-4 py-3 text-base leading-7 text-[var(--cma-text-strong)]'
            }
            role={feedback.kind === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
