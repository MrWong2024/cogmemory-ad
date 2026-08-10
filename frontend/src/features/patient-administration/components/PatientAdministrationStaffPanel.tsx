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
  authorizePatientAdministrationStimulusReplay,
  completePatientAdministrationStaffStep,
  confirmPatientAdministrationPreparation,
  createPatientAdministrationSession,
  getPatientAdministrationSession,
  handoffPatientAdministration,
  PatientAdministrationApiError,
  pausePatientAdministration,
  reissuePatientAdministrationEntryCode,
  redoLastPatientAdministrationStep,
  resumePatientAdministration,
  takeOverPatientAdministrationCurrentStep,
  terminatePatientAdministration,
} from '@/src/features/patient-administration/api/patient-administration-api';
import {
  PatientAdministrationPreparation,
  type PatientAdministrationPreparationValue,
} from '@/src/features/patient-administration/components/PatientAdministrationPreparation';
import { PatientAdministrationStaffStepControls } from '@/src/features/patient-administration/components/PatientAdministrationStaffStepControls';
import {
  formatPatientAdministrationDate,
  patientAdministrationStatusLabels,
  patientAdministrationStatusTones,
} from '@/src/features/patient-administration/lib/patient-administration-display';
import type {
  PatientAdministrationEntryCodeResponse,
  PatientAdministrationRouteIds,
  PatientAdministrationSessionSummary,
  PatientAdministrationStatus,
} from '@/src/features/patient-administration/types/patient-administration';

type FlowChoice = 'same_device' | 'cross_device';

type Props = PatientAdministrationRouteIds & {
  onSessionStatusChange?: (status: PatientAdministrationStatus | null) => void;
  onUnauthorized: () => void;
};

const openStatuses = new Set(['prepared', 'active', 'paused']);
const terminalStatuses = new Set(['completed', 'terminated', 'expired']);
const inputClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-[var(--cma-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';
const checkboxClassName =
  'mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

function inferFlowChoiceFromSession(
  session: PatientAdministrationSessionSummary,
): FlowChoice | null {
  if (
    session.status === 'prepared' &&
    session.preparationConfirmedAt &&
    !session.hasPatientCredential
  ) {
    return 'same_device';
  }
  if (
    session.status === 'prepared' &&
    !session.preparationConfirmedAt &&
    session.hasPatientCredential
  ) {
    return 'cross_device';
  }
  return null;
}

function getPanelErrorMessage(error: unknown): string {
  if (!(error instanceof PatientAdministrationApiError)) {
    return '患者施测服务暂不可用，请稍后手动刷新。';
  }
  if (error.kind === 'forbidden') {
    return '当前账号没有患者施测会话的操作权限。';
  }
  if (error.kind === 'validation') {
    return '提交内容不符合要求，请检查原因和备注长度。';
  }
  if (error.kind === 'session_not_found') {
    return '当前量表实例尚未创建患者施测会话。';
  }
  if (error.kind === 'step_invalid') {
    return '当前步骤不支持此操作，请刷新并核对服务端状态。';
  }
  if (error.kind === 'asset_not_allowed') {
    return '当前步骤不允许授权该资源，请刷新并核对当前步骤。';
  }
  return '患者施测服务暂不可用，请稍后手动刷新。';
}

export function PatientAdministrationStaffPanel({
  patientId,
  visitId,
  scaleInstanceId,
  onSessionStatusChange,
  onUnauthorized,
}: Props) {
  const [session, setSession] =
    useState<PatientAdministrationSessionSummary | null>(null);
  const [entryCode, setEntryCode] = useState<string | null>(null);
  const [flowChoice, setFlowChoice] = useState<FlowChoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [writeAction, setWriteAction] = useState<string | null>(null);
  const [preparationValue, setPreparationValue] =
    useState<PatientAdministrationPreparationValue>({
      ready: false,
      impactFactorCodes: [],
      impactFactorNote: '',
    });
  const [preparationResetKey, setPreparationResetKey] = useState('initial');
  const [crossDevicePreparationConfirmed, setCrossDevicePreparationConfirmed] =
    useState(false);
  const [handoffConfirmed, setHandoffConfirmed] = useState(false);
  const [controlReason, setControlReason] = useState('');
  const [reissueReason, setReissueReason] = useState('');
  const [reissueConfirmed, setReissueConfirmed] = useState(false);
  const [terminateReason, setTerminateReason] = useState('');
  const [terminateConfirmed, setTerminateConfirmed] = useState(false);
  const [failClosed, setFailClosed] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const readInFlightRef = useRef(false);
  const writeInFlightRef = useRef(false);
  const sessionRef = useRef<PatientAdministrationSessionSummary | null>(null);

  const ids: PatientAdministrationRouteIds = {
    patientId,
    visitId,
    scaleInstanceId,
  };

  const applySession = useCallback(
    (response: PatientAdministrationSessionSummary) => {
      const previous = sessionRef.current;
      if (
        previous &&
        previous.id === response.id &&
        previous.revision > response.revision
      ) {
        return;
      }
      sessionRef.current = response;
      setSession(response);
      onSessionStatusChange?.(response.status);
      const inferredFlowChoice = inferFlowChoiceFromSession(response);
      if (inferredFlowChoice) {
        setFlowChoice(inferredFlowChoice);
      }
    },
    [onSessionStatusChange],
  );

  const handleReadError = useCallback(
    (error: unknown) => {
      if (
        error instanceof PatientAdministrationApiError &&
        error.kind === 'unauthenticated'
      ) {
        onUnauthorized();
        return;
      }
      if (
        error instanceof PatientAdministrationApiError &&
        error.kind === 'session_not_found'
      ) {
        sessionRef.current = null;
        setSession(null);
        onSessionStatusChange?.(null);
        setMessage(null);
        return;
      }
      setMessage(getPanelErrorMessage(error));
    },
    [onSessionStatusChange, onUnauthorized],
  );

  const loadSession = useCallback(
    async (replaceInFlight = false) => {
      if (writeInFlightRef.current) return;
      if (readInFlightRef.current && !replaceInFlight) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      const requestId = ++requestIdRef.current;
      controllerRef.current = controller;
      readInFlightRef.current = true;
      try {
        const response = await getPatientAdministrationSession(
          { patientId, visitId, scaleInstanceId },
          controller.signal,
        );
        if (requestId !== requestIdRef.current) return;
        applySession(response);
        setMessage(null);
      } catch (error: unknown) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        handleReadError(error);
      } finally {
        if (requestId === requestIdRef.current) {
          readInFlightRef.current = false;
          controllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [applySession, handleReadError, patientId, scaleInstanceId, visitId],
  );

  useEffect(() => {
    void loadSession();
    return () => {
      requestIdRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      readInFlightRef.current = false;
    };
  }, [loadSession]);

  useEffect(() => {
    if (!session || !openStatuses.has(session.status) || writeAction || failClosed) {
      return;
    }
    const timer = window.setInterval(() => void loadSession(), 5_000);
    return () => window.clearInterval(timer);
  }, [failClosed, loadSession, session, writeAction]);

  useEffect(() => {
    if (!session) return;
    if (
      session.status === 'active' ||
      terminalStatuses.has(session.status) ||
      session.hasPatientCredential
    ) {
      setEntryCode(null);
    }
    if (terminalStatuses.has(session.status)) {
      setFlowChoice(null);
      setCrossDevicePreparationConfirmed(false);
      setPreparationResetKey(`terminal:${session.id}:${session.revision}`);
    }
  }, [session]);

  async function reconcileAfterWrite(action: 'conflict' | 'uncertain', codeLost: boolean) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    controllerRef.current = controller;
    readInFlightRef.current = true;
    try {
      const response = await getPatientAdministrationSession(ids, controller.signal);
      if (requestId !== requestIdRef.current) return;
      applySession(response);
      setMessage(
        action === 'conflict'
          ? '状态已更新，请确认后重试。'
          : codeLost
            ? '写入结果曾不确定，已读取最新状态；进入码无法恢复，请由医护人员显式重新签发。'
            : '写入结果曾不确定，已读取最新状态；请确认后再决定下一步。',
      );
    } catch (error: unknown) {
      if (!controller.signal.aborted) handleReadError(error);
    } finally {
      if (requestId === requestIdRef.current) {
        readInFlightRef.current = false;
        controllerRef.current = null;
      }
    }
  }

  function beginWrite(action: string): boolean {
    if (writeInFlightRef.current) return false;
    controllerRef.current?.abort();
    requestIdRef.current += 1;
    readInFlightRef.current = false;
    writeInFlightRef.current = true;
    setWriteAction(action);
    setMessage(null);
    return true;
  }

  function finishWrite() {
    writeInFlightRef.current = false;
    setWriteAction(null);
  }

  async function handleWriteFailure(error: unknown, codeLost = false) {
    if (
      error instanceof PatientAdministrationApiError &&
      error.kind === 'unauthenticated'
    ) {
      onUnauthorized();
      return;
    }
    if (
      error instanceof PatientAdministrationApiError &&
      error.kind === 'session_conflict'
    ) {
      await reconcileAfterWrite('conflict', codeLost);
      return;
    }
    if (
      error instanceof PatientAdministrationApiError &&
      error.kind === 'request_outcome_uncertain'
    ) {
      await reconcileAfterWrite('uncertain', codeLost);
      return;
    }
    setMessage(getPanelErrorMessage(error));
  }

  async function handleCreate() {
    if (!flowChoice || !beginWrite('create')) return;
    setEntryCode(null);
    try {
      const response = await createPatientAdministrationSession(ids);
      applySession(response);
      setEntryCode(response.entryCode);
      setPreparationResetKey(`create:${response.id}:${response.revision}`);
      setCrossDevicePreparationConfirmed(false);
      setMessage('患者施测会话已创建。进入码只在当前页面内存中临时显示。');
    } catch (error: unknown) {
      await handleWriteFailure(error, true);
    } finally {
      finishWrite();
    }
  }

  async function handlePreparationConfirm() {
    const latest = sessionRef.current;
    if (!latest || !beginWrite('preparation')) return;
    try {
      const response = await confirmPatientAdministrationPreparation(ids, {
        expectedRevision: latest.revision,
        impactFactorCodes: preparationValue.impactFactorCodes,
        ...(preparationValue.impactFactorNote.trim()
          ? { impactFactorNote: preparationValue.impactFactorNote.trim() }
          : {}),
      });
      applySession(response);
      setPreparationResetKey(`confirmed:${response.id}:${response.revision}`);
      setCrossDevicePreparationConfirmed(false);
      setMessage(
        response.status === 'active'
          ? '患者设备准备已确认，会话已进入施测状态。'
          : '设备准备与影响因素已确认。请核对后执行同设备安全交接。',
      );
    } catch (error: unknown) {
      await handleWriteFailure(error);
    } finally {
      finishWrite();
    }
  }

  async function handleHandoff() {
    const latest = sessionRef.current;
    if (!latest || !beginWrite('handoff')) return;
    setFailClosed(true);
    setEntryCode(null);
    try {
      await handoffPatientAdministration(ids, latest.revision);
      window.location.replace('/patient-administration');
    } catch (error: unknown) {
      window.location.replace(
        error instanceof PatientAdministrationApiError &&
          error.kind === 'unauthenticated'
          ? '/login'
          : '/patient-administration',
      );
    }
  }

  async function handlePauseOrResume(action: 'pause' | 'resume') {
    const latest = sessionRef.current;
    if (!latest || !beginWrite(action)) return;
    const input = {
      expectedRevision: latest.revision,
      ...(controlReason.trim() ? { reason: controlReason.trim() } : {}),
    };
    try {
      const response =
        action === 'pause'
          ? await pausePatientAdministration(ids, input)
          : await resumePatientAdministration(ids, input);
      applySession(response);
      setControlReason('');
      setMessage(action === 'pause' ? '患者施测已暂停。' : '患者施测已恢复。');
    } catch (error: unknown) {
      await handleWriteFailure(error);
    } finally {
      finishWrite();
    }
  }

  async function handleReissue() {
    const latest = sessionRef.current;
    const reason = reissueReason.trim();
    if (!latest || !reason || !reissueConfirmed || !beginWrite('reissue')) return;
    setEntryCode(null);
    try {
      const response: PatientAdministrationEntryCodeResponse =
        await reissuePatientAdministrationEntryCode(ids, {
          expectedRevision: latest.revision,
          reason,
        });
      applySession(response);
      setFlowChoice('cross_device');
      setEntryCode(response.entryCode);
      setReissueReason('');
      setReissueConfirmed(false);
      setMessage('已按服务端真实状态重新签发进入码；旧患者设备凭证已失效。');
    } catch (error: unknown) {
      await handleWriteFailure(error, true);
    } finally {
      finishWrite();
    }
  }

  async function handleTerminate() {
    const latest = sessionRef.current;
    const reason = terminateReason.trim();
    if (!latest || !reason || !terminateConfirmed || !beginWrite('terminate')) return;
    try {
      const response = await terminatePatientAdministration(ids, {
        expectedRevision: latest.revision,
        reason,
      });
      applySession(response);
      setEntryCode(null);
      setTerminateReason('');
      setTerminateConfirmed(false);
      setPreparationResetKey(`terminated:${response.id}:${response.revision}`);
      setMessage('患者施测会话已终止。');
    } catch (error: unknown) {
      await handleWriteFailure(error);
    } finally {
      finishWrite();
    }
  }

  async function handleStaffStepComplete(
    staffObservation: string,
  ): Promise<boolean> {
    const latest = sessionRef.current;
    if (!latest || !beginWrite('staff-complete')) return false;
    try {
      const response = await completePatientAdministrationStaffStep(ids, {
        expectedRevision: latest.revision,
        staffObservation,
      });
      applySession(response);
      setMessage('医护观察已记录，服务端已推进到最新步骤。');
      return true;
    } catch (error: unknown) {
      await handleWriteFailure(error);
      return false;
    } finally {
      finishWrite();
    }
  }

  async function handleTakeover(
    reason: string,
    staffObservation: string,
  ): Promise<boolean> {
    const latest = sessionRef.current;
    if (!latest || !beginWrite('takeover')) return false;
    try {
      const response = await takeOverPatientAdministrationCurrentStep(ids, {
        expectedRevision: latest.revision,
        reason,
        staffObservation,
      });
      applySession(response);
      setMessage('当前步骤已由医护接管；施测仍保持暂停，请核对后显式恢复。');
      return true;
    } catch (error: unknown) {
      await handleWriteFailure(error);
      return false;
    } finally {
      finishWrite();
    }
  }

  async function handleRedo(reason: string): Promise<boolean> {
    const latest = sessionRef.current;
    if (!latest || !beginWrite('redo')) return false;
    try {
      const response = await redoLastPatientAdministrationStep(ids, {
        expectedRevision: latest.revision,
        reason,
      });
      applySession(response);
      setMessage('服务端已回退到需重做的步骤；施测仍保持暂停，请核对后显式恢复。');
      return true;
    } catch (error: unknown) {
      await handleWriteFailure(error);
      return false;
    } finally {
      finishWrite();
    }
  }

  async function handleReplayAuthorize(
    assetKey: string,
    reason: string,
  ): Promise<boolean> {
    const latest = sessionRef.current;
    if (!latest || !beginWrite('replay-authorize')) return false;
    try {
      const response = await authorizePatientAdministrationStimulusReplay(
        ids,
        assetKey,
        { expectedRevision: latest.revision, reason },
      );
      applySession(response);
      setMessage('技术重播已授权，请恢复施测。');
      return true;
    } catch (error: unknown) {
      await handleWriteFailure(error);
      return false;
    } finally {
      finishWrite();
    }
  }

  if (failClosed) {
    return (
      <Card aria-live="assertive" role="status">
        <CardHeader>
          <CardTitle>正在安全切换设备身份</CardTitle>
          <CardDescription>医护工作区内容已隐藏，请勿返回上一页。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const canCreate = !session || terminalStatuses.has(session.status);
  const canConfirmPreparation = Boolean(
    session?.status === 'prepared' &&
      !session.preparationConfirmedAt &&
      ((flowChoice === 'same_device' &&
        !session.hasPatientCredential &&
        preparationValue.ready) ||
        (flowChoice === 'cross_device' &&
          session.hasPatientCredential &&
          crossDevicePreparationConfirmed)),
  );
  const canHandoff = Boolean(
    session?.status === 'prepared' &&
      session.preparationConfirmedAt &&
      !session.hasPatientCredential &&
      flowChoice === 'same_device' &&
      handoffConfirmed,
  );

  return (
    <Card data-testid="patient-administration-staff-panel">
      <CardHeader className="border-b border-[var(--cma-line)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-2">
            <Badge tone="info">MMSE 患者施测</Badge>
            <CardTitle>患者施测发起与会话控制</CardTitle>
          </div>
          <Button
            disabled={loading || Boolean(writeAction)}
            onClick={() => void loadSession(true)}
            variant="secondary"
          >
            {loading ? '正在读取…' : '手动刷新'}
          </Button>
        </div>
        <CardDescription>
          用于患者施测发起、设备准备、当前步骤监管以及必要的暂停、接管、重做和医护观察。患者原始作答尚需医生后续复核确认后才进入正式量表结果。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 pt-6">
        {message ? (
          <p
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-info)]"
            role="status"
          >
            {message}
          </p>
        ) : null}

        {session ? (
          <dl className="grid gap-4 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">会话状态</dt>
              <dd className="mt-2">
                <Badge tone={patientAdministrationStatusTones[session.status]}>
                  {patientAdministrationStatusLabels[session.status]}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">服务端 revision</dt>
              <dd className="mt-1 text-lg font-semibold">{session.revision}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">患者设备凭证</dt>
              <dd className="mt-1 text-base">
                {session.hasPatientCredential ? '患者设备已进入' : '尚未进入'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">会话有效期</dt>
              <dd className="mt-1 text-base">
                {formatPatientAdministrationDate(session.expiresAt)}
              </dd>
            </div>
          </dl>
        ) : null}

        {entryCode ? (
          <section
            aria-labelledby="entry-code-title"
            className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-5"
          >
            <h3 className="text-lg font-semibold" id="entry-code-title">
              本次可见的六位进入码
            </h3>
            <p
              aria-label="六位患者施测进入码"
              className="my-4 text-center text-4xl font-semibold tracking-[0.3em] text-[var(--cma-text-strong)]"
              data-testid="patient-administration-entry-code"
            >
              {entryCode}
            </p>
            <p className="text-sm leading-6 text-[var(--cma-warning)]">
              仅请当面告知患者；不要复制到聊天、截图或其他存储。刷新页面后无法恢复。
            </p>
          </section>
        ) : null}

        {canCreate ? (
          <section className="grid gap-4" aria-labelledby="create-session-title">
            <div>
              <h3 className="text-xl font-semibold" id="create-session-title">
                选择本次设备流程
              </h3>
              <p className="mt-1 text-base text-[var(--cma-muted)]">
                此选择只存在当前页面内存，不会写入服务端。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex gap-3 rounded-md border border-[var(--cma-line)] p-4">
                <input
                  checked={flowChoice === 'same_device'}
                  className={checkboxClassName}
                  disabled={Boolean(writeAction)}
                  name="patient-administration-flow"
                  onChange={() => setFlowChoice('same_device')}
                  type="radio"
                />
                <span>
                  <strong className="block">同一设备</strong>
                  <span className="text-sm text-[var(--cma-muted)]">
                    医护在本机准备后撤销自身登录，并安全交给患者。
                  </span>
                </span>
              </label>
              <label className="flex gap-3 rounded-md border border-[var(--cma-line)] p-4">
                <input
                  checked={flowChoice === 'cross_device'}
                  className={checkboxClassName}
                  disabled={Boolean(writeAction)}
                  name="patient-administration-flow"
                  onChange={() => setFlowChoice('cross_device')}
                  type="radio"
                />
                <span>
                  <strong className="block">跨设备</strong>
                  <span className="text-sm text-[var(--cma-muted)]">
                    患者在另一台设备输入六位进入码。
                  </span>
                </span>
              </label>
            </div>
            <Button
              className="min-h-12 sm:w-fit"
              disabled={!flowChoice || Boolean(writeAction)}
              onClick={() => void handleCreate()}
              size="lg"
            >
              {writeAction === 'create' ? '正在创建…' : '创建患者施测会话'}
            </Button>
          </section>
        ) : null}

        {session?.status === 'prepared' && !session.preparationConfirmedAt ? (
          <section className="grid gap-5 border-t border-[var(--cma-line)] pt-6">
            {!flowChoice ? (
              <p className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-[var(--cma-warning)]">
                当前页面未保留设备流程选择。请根据患者所在设备重新选择；该选择不会改变服务端状态。
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={session.hasPatientCredential || Boolean(writeAction)}
                onClick={() => {
                  setFlowChoice('same_device');
                  setCrossDevicePreparationConfirmed(false);
                }}
                variant={flowChoice === 'same_device' ? 'primary' : 'secondary'}
              >
                同一设备准备
              </Button>
              <Button
                disabled={Boolean(writeAction)}
                onClick={() => {
                  setFlowChoice('cross_device');
                  setPreparationResetKey(`cross:${session.id}:${session.revision}`);
                }}
                variant={flowChoice === 'cross_device' ? 'primary' : 'secondary'}
              >
                跨设备准备
              </Button>
            </div>

            {flowChoice === 'same_device' ? (
              <PatientAdministrationPreparation
                disabled={Boolean(writeAction)}
                onChange={setPreparationValue}
                resetKey={preparationResetKey}
                showImpactFactors
              />
            ) : null}

            {flowChoice === 'cross_device' ? (
              <div className="grid gap-5">
                <p className="rounded-md border border-[var(--cma-line)] px-4 py-3">
                  {session.hasPatientCredential
                    ? '患者设备已兑换凭证。请由患者在其设备完成本地准备，并当面告知医护人员。'
                    : '请先让患者在另一台设备输入进入码。患者凭证出现前不能确认准备。'}
                </p>
                <PatientAdministrationPreparation
                  disabled={Boolean(writeAction)}
                  onChange={setPreparationValue}
                  resetKey={preparationResetKey}
                  showImpactFactors
                  showLocalPreparation={false}
                />
                <label className="flex gap-3 rounded-md border border-[var(--cma-line)] p-4">
                  <input
                    checked={crossDevicePreparationConfirmed}
                    className={checkboxClassName}
                    disabled={!session.hasPatientCredential || Boolean(writeAction)}
                    onChange={(event) =>
                      setCrossDevicePreparationConfirmed(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>患者已当面告知本机准备与不计分练习完成</span>
                </label>
              </div>
            ) : null}

            <Button
              className="min-h-12 sm:w-fit"
              disabled={!canConfirmPreparation || Boolean(writeAction)}
              onClick={() => void handlePreparationConfirm()}
              size="lg"
            >
              {writeAction === 'preparation'
                ? '正在确认准备…'
                : '确认准备与影响因素'}
            </Button>
          </section>
        ) : null}

        {session?.status === 'prepared' &&
        session.preparationConfirmedAt &&
        flowChoice === 'same_device' ? (
          <section className="grid gap-4 border-t border-[var(--cma-line)] pt-6">
            <h3 className="text-xl font-semibold">同设备不可逆安全交接</h3>
            <p className="text-base leading-7 text-[var(--cma-warning)]">
              交接会撤销当前医护登录，清除工作区访问身份，并把本设备切换为患者施测。提交后不要返回本页。
            </p>
            <label className="flex gap-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4">
              <input
                checked={handoffConfirmed}
                className={checkboxClassName}
                disabled={Boolean(writeAction)}
                onChange={(event) => setHandoffConfirmed(event.target.checked)}
                type="checkbox"
              />
              <span>我已确认设备将立即交给患者，并理解当前医护登录会被撤销</span>
            </label>
            <Button
              className="min-h-12 sm:w-fit"
              disabled={!canHandoff || Boolean(writeAction)}
              onClick={() => void handleHandoff()}
              size="lg"
            >
              安全交接给患者
            </Button>
          </section>
        ) : null}

        {session &&
        (session.status === 'active' || session.status === 'paused') ? (
          <PatientAdministrationStaffStepControls
            disabled={Boolean(writeAction)}
            onComplete={handleStaffStepComplete}
            onRedo={handleRedo}
            onReplayAuthorize={handleReplayAuthorize}
            onTakeover={handleTakeover}
            session={session}
            writeAction={writeAction}
          />
        ) : null}

        {session && openStatuses.has(session.status) ? (
          <section className="grid gap-5 border-t border-[var(--cma-line)] pt-6">
            <h3 className="text-xl font-semibold">会话控制</h3>
            <label className="grid gap-2 font-semibold">
              暂停 / 恢复原因（可选，最多 500 字）
              <input
                className={inputClassName}
                disabled={Boolean(writeAction)}
                maxLength={500}
                onChange={(event) => setControlReason(event.target.value)}
                value={controlReason}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              {session.status === 'active' ? (
                <Button
                  disabled={Boolean(writeAction)}
                  onClick={() => void handlePauseOrResume('pause')}
                  variant="secondary"
                >
                  {writeAction === 'pause' ? '正在暂停…' : '暂停施测'}
                </Button>
              ) : null}
              {session.status === 'paused' ? (
                <Button
                  disabled={Boolean(writeAction)}
                  onClick={() => void handlePauseOrResume('resume')}
                  variant="secondary"
                >
                  {writeAction === 'resume' ? '正在恢复…' : '恢复施测'}
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4">
              <h4 className="font-semibold">换设备并重新签发进入码</h4>
              <label className="grid gap-2 font-semibold">
                重新签发原因（必填，最多 500 字）
                <input
                  className={inputClassName}
                  disabled={Boolean(writeAction)}
                  maxLength={500}
                  onChange={(event) => setReissueReason(event.target.value)}
                  value={reissueReason}
                />
              </label>
              <label className="flex gap-3">
                <input
                  checked={reissueConfirmed}
                  className={checkboxClassName}
                  disabled={Boolean(writeAction)}
                  onChange={(event) => setReissueConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>我确认旧患者设备凭证将失效，并需要把新码当面告知患者</span>
              </label>
              <Button
                className="sm:w-fit"
                disabled={
                  !reissueReason.trim() ||
                  !reissueConfirmed ||
                  Boolean(writeAction)
                }
                onClick={() => void handleReissue()}
                variant="secondary"
              >
                {writeAction === 'reissue' ? '正在重新签发…' : '重新签发进入码'}
              </Button>
            </div>

            <div className="grid gap-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4">
              <h4 className="font-semibold text-[var(--cma-warning)]">终止本次患者施测</h4>
              <label className="grid gap-2 font-semibold">
                终止原因（必填，最多 500 字）
                <input
                  className={inputClassName}
                  disabled={Boolean(writeAction)}
                  maxLength={500}
                  onChange={(event) => setTerminateReason(event.target.value)}
                  value={terminateReason}
                />
              </label>
              <label className="flex gap-3">
                <input
                  checked={terminateConfirmed}
                  className={checkboxClassName}
                  disabled={Boolean(writeAction)}
                  onChange={(event) => setTerminateConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>我确认终止后患者凭证与进入码均不可继续使用</span>
              </label>
              <Button
                className="sm:w-fit"
                disabled={
                  !terminateReason.trim() ||
                  !terminateConfirmed ||
                  Boolean(writeAction)
                }
                onClick={() => void handleTerminate()}
                variant="secondary"
              >
                {writeAction === 'terminate' ? '正在终止…' : '确认终止会话'}
              </Button>
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
