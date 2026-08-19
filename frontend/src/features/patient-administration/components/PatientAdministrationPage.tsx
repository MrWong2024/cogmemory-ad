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
  getCurrentPatientAdministration,
  PatientAdministrationApiError,
} from '@/src/features/patient-administration/api/patient-administration-api';
import { PatientAdministrationPreparation } from '@/src/features/patient-administration/components/PatientAdministrationPreparation';
import { PatientAdministrationCurrentStep } from '@/src/features/patient-administration/components/PatientAdministrationCurrentStep';
import {
  patientAdministrationStatusLabels,
  patientAdministrationStatusTones,
} from '@/src/features/patient-administration/lib/patient-administration-display';
import type { PatientAdministrationCurrentResponse } from '@/src/features/patient-administration/types/patient-administration';

const openStatuses = new Set(['prepared', 'active', 'paused']);

export function PatientAdministrationPage() {
  const [current, setCurrent] =
    useState<PatientAdministrationCurrentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionInterrupted, setConnectionInterrupted] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);

  const applyCurrent = useCallback(
    (response: PatientAdministrationCurrentResponse) => {
      setCurrent((previous) =>
        previous && previous.revision > response.revision ? previous : response,
      );
    },
    [],
  );

  const applyRevision = useCallback((revision: number) => {
    setCurrent((previous) =>
      previous && revision > previous.revision
        ? { ...previous, revision }
        : previous,
    );
  }, []);

  const loadCurrent = useCallback(async (replaceInFlight = false) => {
    if (inFlightRef.current && !replaceInFlight) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    controllerRef.current = controller;
    inFlightRef.current = true;
    try {
      const response = await getCurrentPatientAdministration(controller.signal);
      if (requestId !== requestIdRef.current) return;
      applyCurrent(response);
      setInvalid(false);
      setConnectionInterrupted(false);
    } catch (error: unknown) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      if (
        error instanceof PatientAdministrationApiError &&
        error.kind === 'unauthenticated'
      ) {
        setInvalid(true);
        setCurrent(null);
      } else {
        setConnectionInterrupted(true);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        inFlightRef.current = false;
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }, [applyCurrent]);

  useEffect(() => {
    void loadCurrent();
    return () => {
      requestIdRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      inFlightRef.current = false;
    };
  }, [loadCurrent]);

  useEffect(() => {
    if (!current || !openStatuses.has(current.status) || invalid) return;
    const timer = window.setInterval(() => void loadCurrent(), 3_000);
    return () => window.clearInterval(timer);
  }, [current, invalid, loadCurrent]);

  if (loading && !current && !invalid) {
    return (
      <Card aria-live="polite" role="status">
        <CardHeader>
          <CardTitle className="text-3xl">正在确认施测状态</CardTitle>
          <CardDescription className="text-lg">
            请保持设备在医护人员视线内，稍候片刻。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (invalid) {
    return (
      <Card role="alert">
        <CardHeader>
          <Badge tone="warning">安全结束</Badge>
          <CardTitle className="text-3xl">当前患者施测凭证已失效</CardTitle>
          <CardDescription className="text-lg">
            可能是会话已结束、设备已更换，或同设备交接未能确认。请交还设备并由医护人员重新登录。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="min-h-12 w-full sm:w-auto"
            onClick={() => window.location.replace('/login')}
            size="lg"
          >
            交还设备并由医护人员重新登录
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!current) {
    return (
      <Card role="alert">
        <CardHeader>
          <Badge tone="warning">连接暂时中断</Badge>
          <CardTitle className="text-3xl">暂时无法确认施测状态</CardTitle>
          <CardDescription className="text-lg">
            请保持当前页面，不要输入其他信息，并请医护人员协助检查连接。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void loadCurrent(true)} size="lg">
            重新检查
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-5">
      {connectionInterrupted ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-[var(--cma-warning)]"
          role="status"
        >
          <span>连接暂时中断，页面保留上一次安全状态。</span>
          <Button onClick={() => void loadCurrent(true)} variant="secondary">
            重新检查
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader className="border-b border-[var(--cma-line)]">
          <Badge tone={patientAdministrationStatusTones[current.status]}>
            {patientAdministrationStatusLabels[current.status]}
          </Badge>
          {current.status === 'prepared' ? (
            <>
              <CardTitle className="text-3xl">
                请先完成本机必要设备检查
              </CardTitle>
              <CardDescription className="text-lg">
                请完成必要设备检查；如不熟悉触摸或书写操作，可按需展开不计分练习。完成检查后请告知医护人员。
              </CardDescription>
            </>
          ) : null}
          {current.status === 'active' ? (
            <>
              <CardTitle className="text-3xl">已进入患者施测模式</CardTitle>
              <CardDescription className="text-lg">
                请一次只完成当前显示的步骤，并在需要时告知医护人员。
              </CardDescription>
            </>
          ) : null}
          {current.status === 'paused' ? (
            <>
              <CardTitle className="text-3xl">施测已暂停，请稍候</CardTitle>
              <CardDescription className="text-lg">
                请保持页面打开，等待医护人员处理；患者端无需进行恢复操作。
              </CardDescription>
            </>
          ) : null}
          {current.status === 'completed' ? (
            <>
              <CardTitle className="text-3xl">
                本次作答已完成，请将设备交还医护人员
              </CardTitle>
              <CardDescription className="text-lg">
                此页面不显示分数、答案或报告。
              </CardDescription>
            </>
          ) : null}
          {current.status === 'terminated' || current.status === 'expired' ? (
            <>
              <CardTitle className="text-3xl">本次患者施测已安全结束</CardTitle>
              <CardDescription className="text-lg">
                请将设备交还医护人员。
              </CardDescription>
            </>
          ) : null}
        </CardHeader>
        <CardContent className="pt-6">
          {current.status === 'prepared' ? (
            <div className="grid gap-5">
              <PatientAdministrationPreparation
                onChange={(value) => setLocalReady(value.ready)}
                resetKey={`${current.status}:${current.revision}`}
              />
              {localReady ? (
                <p
                  className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] px-5 py-4 text-lg font-semibold text-[var(--cma-success)]"
                  role="status"
                >
                  本机必要设备检查已完成，请告知医护人员确认。
                </p>
              ) : null}
            </div>
          ) : null}
          {current.status === 'active' ? (
            current.currentStep ? (
              <PatientAdministrationCurrentStep
                key={current.currentStep.stepKey}
                onCurrentChange={applyCurrent}
                onRevisionChange={applyRevision}
                revision={current.revision}
                step={current.currentStep}
              />
            ) : (
              <p
                className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-5 py-4 text-lg text-[var(--cma-warning)]"
                role="alert"
              >
                当前步骤暂时不可用，请让医护人员协助。
              </p>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
