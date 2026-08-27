'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
  deletePatientAdministrationSession,
  listPatientAdministrationSessions,
  PatientAdministrationApiError,
} from '@/src/features/patient-administration/api/patient-administration-api';
import {
  formatPatientAdministrationDate,
  patientAdministrationStatusLabels,
  patientAdministrationStatusTones,
} from '@/src/features/patient-administration/lib/patient-administration-display';
import type {
  PatientAdministrationDeviceMode,
  PatientAdministrationRouteIds,
  PatientAdministrationSessionSummary,
  PatientAdministrationStatus,
} from '@/src/features/patient-administration/types/patient-administration';

type Props = PatientAdministrationRouteIds & {
  latestSessionRefreshSignal: Pick<
    PatientAdministrationSessionSummary,
    'id' | 'revision'
  > | null;
  onLatestSessionRefresh: () => Promise<void>;
  onUnauthorized: () => void;
};

const deletableStatuses = new Set<PatientAdministrationStatus>([
  'terminated',
  'expired',
]);
const deviceModeLabels: Record<PatientAdministrationDeviceMode, string> = {
  same_device: '同一设备',
  cross_device: '跨设备',
};
const checkboxClassName =
  'mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

function getHistoryReadErrorMessage(error: unknown): string {
  if (!(error instanceof PatientAdministrationApiError)) {
    return '患者施测历史暂时无法读取，请稍后重试。';
  }
  if (error.kind === 'forbidden') {
    return '当前账号没有查看患者施测历史的权限。';
  }
  return '患者施测历史暂时无法读取，请稍后重试。';
}

export function PatientAdministrationHistoryPanel({
  patientId,
  visitId,
  scaleInstanceId,
  latestSessionRefreshSignal,
  onLatestSessionRefresh,
  onUnauthorized,
}: Props) {
  const [sessions, setSessions] = useState<
    PatientAdministrationSessionSummary[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const readControllerRef = useRef<AbortController | null>(null);
  const readRequestIdRef = useRef(0);
  const deleteInFlightRef = useRef(false);

  const loadHistory = useCallback(
    async (successMessage?: string): Promise<boolean> => {
      readControllerRef.current?.abort();
      const controller = new AbortController();
      const requestId = ++readRequestIdRef.current;
      readControllerRef.current = controller;
      setLoading(true);
      try {
        const response = await listPatientAdministrationSessions(
          { patientId, visitId, scaleInstanceId },
          controller.signal,
        );
        if (requestId !== readRequestIdRef.current) return false;
        setSessions(response);
        setFeedback(successMessage ?? null);
        return true;
      } catch (error: unknown) {
        if (controller.signal.aborted || requestId !== readRequestIdRef.current) {
          return false;
        }
        if (
          error instanceof PatientAdministrationApiError &&
          error.kind === 'unauthenticated'
        ) {
          onUnauthorized();
          return false;
        }
        setFeedback(getHistoryReadErrorMessage(error));
        return false;
      } finally {
        if (requestId === readRequestIdRef.current) {
          readControllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [onUnauthorized, patientId, scaleInstanceId, visitId],
  );

  const latestSessionId = latestSessionRefreshSignal?.id ?? null;
  const latestSessionRevision = latestSessionRefreshSignal?.revision ?? null;

  useEffect(() => {
    void loadHistory();
    return () => {
      readRequestIdRef.current += 1;
      readControllerRef.current?.abort();
      readControllerRef.current = null;
    };
  }, [latestSessionId, latestSessionRevision, loadHistory]);

  useEffect(() => {
    if (!deleteTargetId) return;
    const target = sessions.find((session) => session.id === deleteTargetId);
    if (!target || !deletableStatuses.has(target.status)) {
      setDeleteTargetId(null);
      setDeleteConfirmed(false);
    }
  }, [deleteTargetId, sessions]);

  function openDeleteConfirmation(sessionId: string) {
    if (deleteInFlightRef.current) return;
    setDeleteTargetId(sessionId);
    setDeleteConfirmed(false);
    setFeedback(null);
  }

  function closeDeleteConfirmation() {
    if (deleteInFlightRef.current) return;
    setDeleteTargetId(null);
    setDeleteConfirmed(false);
  }

  async function refreshAfterUncertainDelete(): Promise<boolean> {
    const [historyRefreshed] = await Promise.all([
      loadHistory(),
      onLatestSessionRefresh(),
    ]);
    return historyRefreshed;
  }

  async function handleDelete(sessionId: string) {
    const target = sessions.find((session) => session.id === sessionId);
    if (
      !target ||
      !deletableStatuses.has(target.status) ||
      !deleteConfirmed ||
      deleteInFlightRef.current
    ) {
      return;
    }

    deleteInFlightRef.current = true;
    setDeletingSessionId(sessionId);
    setFeedback(null);
    try {
      await deletePatientAdministrationSession(
        { patientId, visitId, scaleInstanceId },
        sessionId,
      );
      setDeleteTargetId(null);
      setDeleteConfirmed(false);
      await Promise.all([
        loadHistory('失败施测记录已永久删除，历史列表已重新读取。'),
        onLatestSessionRefresh(),
      ]);
    } catch (error: unknown) {
      setDeleteTargetId(null);
      setDeleteConfirmed(false);
      if (
        error instanceof PatientAdministrationApiError &&
        error.kind === 'unauthenticated'
      ) {
        onUnauthorized();
      } else if (
        error instanceof PatientAdministrationApiError &&
        error.kind === 'session_not_deletable'
      ) {
        setFeedback('当前施测记录已不满足删除条件，请重新加载后核对。');
      } else if (
        error instanceof PatientAdministrationApiError &&
        error.kind === 'session_not_found'
      ) {
        const historyRefreshed = await loadHistory();
        setFeedback(
          historyRefreshed
            ? '目标记录已不存在，系统未重发删除请求；历史列表已重新加载。'
            : '目标记录已不存在，系统未重发删除请求；历史列表重新加载失败，请稍后手动刷新。',
        );
      } else if (
        error instanceof PatientAdministrationApiError &&
        error.kind === 'request_outcome_uncertain'
      ) {
        const historyRefreshed = await refreshAfterUncertainDelete();
        setFeedback(
          historyRefreshed
            ? '删除请求结果暂时无法确认，系统未自动重试；已重新读取历史列表和最新会话，请核对目标记录是否仍存在。'
            : '删除请求结果暂时无法确认，系统未自动重试；重新读取服务端状态也未完成，请稍后手动刷新并核对。',
        );
      } else if (
        error instanceof PatientAdministrationApiError &&
        error.kind === 'forbidden'
      ) {
        setFeedback('当前账号没有删除失败施测记录的权限，记录已保留。');
      } else {
        setFeedback('删除失败，记录已保留，请稍后重试。');
      }
    } finally {
      deleteInFlightRef.current = false;
      setDeletingSessionId(null);
    }
  }

  return (
    <Card data-testid="patient-administration-history-panel">
      <CardHeader className="border-b border-[var(--cma-line)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-2">
            <Badge tone="neutral">患者施测记录</Badge>
            <CardTitle>患者施测历史</CardTitle>
          </div>
          <Button
            disabled={loading || deletingSessionId !== null}
            onClick={() => void loadHistory()}
            variant="secondary"
          >
            {loading ? '正在读取…' : '重新加载历史'}
          </Button>
        </div>
        <CardDescription>
          展示当前量表实例的全部患者施测记录，包含已完成和失败的历史会话。列表顺序以服务端返回为准。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 pt-6">
        {feedback ? (
          <p
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-info)]"
            role="status"
          >
            {feedback}
          </p>
        ) : null}

        {!loading && sessions.length === 0 ? (
          <p className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] px-4 py-5 text-[var(--cma-muted)]">
            当前量表实例暂无患者施测记录。
          </p>
        ) : null}

        <ol className="grid gap-4">
          {sessions.map((session) => {
            const canDelete = deletableStatuses.has(session.status);
            const isDeleteTarget = deleteTargetId === session.id;
            const isDeleting = deletingSessionId === session.id;

            return (
              <li
                className="grid gap-4 rounded-md border border-[var(--cma-line)] p-4"
                data-session-status={session.status}
                key={session.id}
              >
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                      状态
                    </dt>
                    <dd className="mt-2">
                      <Badge tone={patientAdministrationStatusTones[session.status]}>
                        {patientAdministrationStatusLabels[session.status]}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                      设备方式
                    </dt>
                    <dd className="mt-1">
                      {session.deviceMode
                        ? deviceModeLabels[session.deviceMode]
                        : '未记录'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                      创建时间
                    </dt>
                    <dd className="mt-1">
                      {formatPatientAdministrationDate(session.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                      开始时间
                    </dt>
                    <dd className="mt-1">
                      {formatPatientAdministrationDate(session.startedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                      完成时间
                    </dt>
                    <dd className="mt-1">
                      {formatPatientAdministrationDate(session.completedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                      终止时间
                    </dt>
                    <dd className="mt-1">
                      {formatPatientAdministrationDate(session.terminatedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                      过期时间
                    </dt>
                    <dd className="mt-1">
                      {formatPatientAdministrationDate(session.expiredAt)}
                    </dd>
                  </div>
                </dl>

                {canDelete ? (
                  <div className="grid gap-3 border-t border-[var(--cma-line)] pt-4">
                    {!isDeleteTarget ? (
                      <Button
                        className="sm:w-fit"
                        disabled={deletingSessionId !== null}
                        onClick={() => openDeleteConfirmation(session.id)}
                        variant="secondary"
                      >
                        删除失败施测记录
                      </Button>
                    ) : (
                      <div className="grid gap-4 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4">
                        <p className="leading-7 text-[var(--cma-warning)]">
                          将永久删除这一次失败的患者施测记录及其可安全清理的关联作答证据，不会删除本量表实例、正式题目回答或其他施测记录。
                        </p>
                        <label className="flex gap-3">
                          <input
                            checked={deleteConfirmed}
                            className={checkboxClassName}
                            disabled={isDeleting}
                            onChange={(event) =>
                              setDeleteConfirmed(event.target.checked)
                            }
                            type="checkbox"
                          />
                          <span>我确认永久删除这一次失败施测记录</span>
                        </label>
                        <div className="flex flex-wrap gap-3">
                          <Button
                            disabled={!deleteConfirmed || isDeleting}
                            onClick={() => void handleDelete(session.id)}
                          >
                            {isDeleting ? '正在删除…' : '永久删除'}
                          </Button>
                          <Button
                            disabled={isDeleting}
                            onClick={closeDeleteConfirmation}
                            variant="ghost"
                          >
                            取消
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
