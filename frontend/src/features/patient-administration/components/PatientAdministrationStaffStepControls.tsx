'use client';

import { useState } from 'react';

import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { getMmsePatientAdministrationStepMetadata } from '@/src/features/patient-administration/lib/mmse-patient-administration';
import type { PatientAdministrationSessionSummary } from '@/src/features/patient-administration/types/patient-administration';

type Props = {
  session: PatientAdministrationSessionSummary;
  disabled: boolean;
  writeAction: string | null;
  onComplete: (staffObservation: string) => Promise<boolean>;
  onTakeover: (reason: string, staffObservation: string) => Promise<boolean>;
  onRedo: (reason: string) => Promise<boolean>;
  onReplayAuthorize: (assetKey: string, reason: string) => Promise<boolean>;
};

const inputClassName =
  'min-h-11 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 text-[var(--cma-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)]';

export function PatientAdministrationStaffStepControls({
  session,
  disabled,
  writeAction,
  onComplete,
  onTakeover,
  onRedo,
  onReplayAuthorize,
}: Props) {
  const [staffObservation, setStaffObservation] = useState('');
  const [takeoverReason, setTakeoverReason] = useState('');
  const [takeoverObservation, setTakeoverObservation] = useState('');
  const [redoReason, setRedoReason] = useState('');
  const [replayReason, setReplayReason] = useState('');
  const metadata = getMmsePatientAdministrationStepMetadata(
    session.currentStepKey,
  );

  if (!metadata) {
    return (
      <section className="grid gap-3 border-t border-[var(--cma-line)] pt-6" role="alert">
        <h3 className="text-xl font-semibold">当前步骤监管</h3>
        <p className="rounded-md bg-[var(--cma-warning-soft)] px-4 py-3 text-[var(--cma-warning)]">
          当前患者步骤无法识别，请刷新或停止施测并联系维护人员。
        </p>
      </section>
    );
  }

  const controlsDisabled = disabled || Boolean(writeAction);

  return (
    <section className="grid gap-5 border-t border-[var(--cma-line)] pt-6" aria-labelledby="staff-step-controls-title" data-testid="patient-administration-staff-step-controls">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold" id="staff-step-controls-title">当前步骤监管</h3>
          <p className="mt-1 text-base text-[var(--cma-muted)]">第 {metadata.order} / 19 步 · {metadata.label}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={session.status === 'paused' ? 'warning' : 'info'}>{session.status === 'paused' ? '已暂停' : '进行中'}</Badge>
          <Badge tone="neutral">{metadata.advanceBy === 'staff' ? '由医护推进' : '由患者推进'}</Badge>
        </div>
      </div>

      {session.status === 'active' && metadata.advanceBy === 'staff' ? (
        <div className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4">
          <label className="grid gap-2 font-semibold">
            医护观察（必填，最多 2000 字）
            <textarea className={`${inputClassName} min-h-28 resize-y`} disabled={controlsDisabled} maxLength={2000} onChange={(event) => setStaffObservation(event.target.value)} value={staffObservation} />
          </label>
          <Button className="sm:w-fit" disabled={controlsDisabled || !staffObservation.trim()} onClick={async () => { if (await onComplete(staffObservation.trim())) setStaffObservation(''); }}>
            {writeAction === 'staff-complete' ? '正在确认…' : '确认医护观察并继续'}
          </Button>
        </div>
      ) : null}

      {session.status === 'paused' && metadata.advanceBy === 'patient' ? (
        <div className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4">
          <h4 className="font-semibold">由医护接管当前步骤</h4>
          <label className="grid gap-2 font-semibold">
            接管原因（必填，最多 500 字）
            <input className={inputClassName} disabled={controlsDisabled} maxLength={500} onChange={(event) => setTakeoverReason(event.target.value)} value={takeoverReason} />
          </label>
          <label className="grid gap-2 font-semibold">
            接管观察（必填，最多 2000 字）
            <textarea className={`${inputClassName} min-h-28 resize-y`} disabled={controlsDisabled} maxLength={2000} onChange={(event) => setTakeoverObservation(event.target.value)} value={takeoverObservation} />
          </label>
          <Button className="sm:w-fit" disabled={controlsDisabled || !takeoverReason.trim() || !takeoverObservation.trim()} onClick={async () => { if (await onTakeover(takeoverReason.trim(), takeoverObservation.trim())) { setTakeoverReason(''); setTakeoverObservation(''); } }} variant="secondary">
            {writeAction === 'takeover' ? '正在接管…' : '接管当前步骤'}
          </Button>
        </div>
      ) : null}

      {session.status === 'paused' && metadata.order > 1 ? (
        <div className="grid gap-3 rounded-md border border-[var(--cma-line)] p-4">
          <h4 className="font-semibold">重做上一完成步骤</h4>
          <label className="grid gap-2 font-semibold">
            重做原因（必填，最多 500 字）
            <input className={inputClassName} disabled={controlsDisabled} maxLength={500} onChange={(event) => setRedoReason(event.target.value)} value={redoReason} />
          </label>
          <Button className="sm:w-fit" disabled={controlsDisabled || !redoReason.trim()} onClick={async () => { if (await onRedo(redoReason.trim())) setRedoReason(''); }} variant="secondary">
            {writeAction === 'redo' ? '正在重做…' : '重做上一完成步骤'}
          </Button>
        </div>
      ) : null}

      {session.status === 'paused' && metadata.stimulusAssetKey ? (
        <div className="grid gap-3 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] p-4">
          <h4 className="font-semibold">授权一次技术重播</h4>
          <p className="text-sm leading-6 text-[var(--cma-warning)]">仅用于测量语音因技术问题未能正常呈现的情况。授权后仍需显式恢复施测。</p>
          <label className="grid gap-2 font-semibold">
            技术重播原因（必填，最多 500 字）
            <input className={inputClassName} disabled={controlsDisabled} maxLength={500} onChange={(event) => setReplayReason(event.target.value)} value={replayReason} />
          </label>
          <Button className="sm:w-fit" disabled={controlsDisabled || !replayReason.trim()} onClick={async () => { if (metadata.stimulusAssetKey && await onReplayAuthorize(metadata.stimulusAssetKey, replayReason.trim())) setReplayReason(''); }} variant="secondary">
            {writeAction === 'replay-authorize' ? '正在授权…' : '授权技术重播'}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
