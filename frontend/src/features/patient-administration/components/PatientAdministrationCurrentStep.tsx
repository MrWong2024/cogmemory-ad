'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  completeCurrentPatientAdministrationStep,
  getCurrentPatientAdministration,
  getCurrentPatientAdministrationAsset,
  PatientAdministrationApiError,
  playCurrentPatientAdministrationAudio,
  uploadCurrentPatientAdministrationEvidence,
} from '@/src/features/patient-administration/api/patient-administration-api';
import { PatientAdministrationSpeechResponse } from '@/src/features/patient-administration/components/PatientAdministrationSpeechResponse';
import { PatientAdministrationWrittenResponse } from '@/src/features/patient-administration/components/PatientAdministrationWrittenResponse';
import type {
  PatientAdministrationCurrentResponse,
  PatientAdministrationCurrentStep as CurrentStep,
  PatientAdministrationEvidenceUploadInput,
} from '@/src/features/patient-administration/types/patient-administration';

type Props = {
  revision: number;
  step: CurrentStep;
  onCurrentChange: (current: PatientAdministrationCurrentResponse) => void;
  onRevisionChange: (revision: number) => void;
};

type PendingAudioStart = {
  start: () => Promise<void>;
};

function patientErrorMessage(error: unknown): string {
  if (!(error instanceof PatientAdministrationApiError)) {
    return '当前操作未能完成，请告知医护人员协助。';
  }
  if (error.kind === 'media_invalid') {
    return '回答文件格式或大小不符合要求，请重新准备后保存。';
  }
  if (error.kind === 'evidence_not_allowed') {
    return '当前步骤不接受这种回答方式，请告知医护人员协助。';
  }
  if (error.kind === 'asset_not_allowed') {
    return '本题资源暂时不可用，请告知医护人员协助。';
  }
  if (error.kind === 'forbidden') {
    return '当前操作不允许继续，请告知医护人员协助。';
  }
  return '患者施测服务暂不可用，请保持本页并告知医护人员。';
}

export function PatientAdministrationCurrentStep({
  revision,
  step,
  onCurrentChange,
  onRevisionChange,
}: Props) {
  const [mountedStep] = useState(step);
  const revisionRef = useRef(revision);
  const mountedRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioCancelRef = useRef<(() => void) | null>(null);
  const pendingAudioStartRef = useRef<PendingAudioStart | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [responseBusy, setResponseBusy] = useState(false);
  const [showAudioStart, setShowAudioStart] = useState(false);
  const [status, setStatus] = useState('正在准备本题内容');
  const [message, setMessage] = useState<string | null>(null);
  const [helpVisible, setHelpVisible] = useState(false);

  const publishRevision = useCallback(
    (nextRevision: number) => {
      if (nextRevision > revisionRef.current) {
        revisionRef.current = nextRevision;
        onRevisionChange(nextRevision);
      }
    },
    [onRevisionChange],
  );

  useEffect(() => {
    if (revision > revisionRef.current) revisionRef.current = revision;
  }, [revision]);

  const reconcileAfterWrite = useCallback(
    async (uncertain: boolean) => {
      try {
        const current = await getCurrentPatientAdministration();
        if (!mountedRef.current) return;
        onCurrentChange(current);
        setMessage(
          uncertain
            ? '刚才的操作结果无法完全确认，已重新读取最新状态。请在医护人员指导下继续。'
            : '状态已更新，请在医护指导下继续。',
        );
      } catch {
        if (mountedRef.current) {
          setMessage('暂时无法重新确认状态，请保持本页并告知医护人员。');
        }
      }
    },
    [onCurrentChange],
  );

  const handleWriteError = useCallback(
    async (error: unknown, completing = false) => {
      if (error instanceof PatientAdministrationApiError) {
        if (error.kind === 'session_conflict') {
          await reconcileAfterWrite(false);
          return;
        }
        if (error.kind === 'request_outcome_uncertain') {
          await reconcileAfterWrite(true);
          return;
        }
        if (error.kind === 'step_invalid') {
          setMessage(
            completing
              ? '本题还未满足完成条件，请确认回答或书写内容已经保存；如已完成仍不能继续，请告知医护人员。'
              : '当前步骤前置条件尚未满足，请在医护人员指导下继续。',
          );
          return;
        }
      }
      setMessage(patientErrorMessage(error));
    },
    [reconcileAfterWrite],
  );

  const playDownloadedAudio = useCallback((blob: Blob): Promise<void> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      let settled = false;

      function cleanup() {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) audioRef.current = null;
        if (audioUrlRef.current === url) audioUrlRef.current = null;
        pendingAudioStartRef.current = null;
        audioCancelRef.current = null;
        if (mountedRef.current) setShowAudioStart(false);
      }

      function finish() {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      }

      function fail() {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('local audio playback failed'));
      }

      async function start() {
        try {
          await audio.play();
          if (mountedRef.current) setShowAudioStart(false);
        } catch (error: unknown) {
          if (error instanceof DOMException && error.name === 'NotAllowedError') {
            if (mountedRef.current) setShowAudioStart(true);
            return;
          }
          fail();
        }
      }

      audioRef.current = audio;
      audioUrlRef.current = url;
      audio.onended = finish;
      audio.onerror = fail;
      pendingAudioStartRef.current = { start };
      audioCancelRef.current = fail;
      void start();
    });
  }, []);

  const runAudioAssets = useCallback(
    async (assets: CurrentStep['assets']): Promise<boolean> => {
      setAudioBusy(true);
      setMessage(null);
      for (const asset of assets) {
        if (!mountedRef.current) return false;
        setStatus(asset.role === 'stimulus' ? '正在播放本题测量语音' : '正在播放本题指导语');
        try {
          const played = await playCurrentPatientAdministrationAudio(
            asset.assetKey,
            revisionRef.current,
          );
          if (!mountedRef.current) return false;
          publishRevision(played.revision);
          await playDownloadedAudio(played.blob);
        } catch (error: unknown) {
          if (!mountedRef.current) return false;
          if (
            asset.role === 'stimulus' &&
            error instanceof PatientAdministrationApiError &&
            error.kind === 'step_invalid'
          ) {
            setMessage('本轮测量语音已播放过，当前不会再次播放。如您还没有听清，请告诉医护人员处理。');
            continue;
          }
          if (!(error instanceof PatientAdministrationApiError)) {
            setMessage('题目语音未能正常播放，请告知医护人员。');
            setStatus('题目语音播放失败');
          } else {
            await handleWriteError(error);
          }
          setAudioBusy(false);
          return false;
        }
      }
      if (mountedRef.current) setAudioBusy(false);
      return true;
    },
    [handleWriteError, playDownloadedAudio, publishRevision],
  );

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    const imageAsset = mountedStep.assets.find((asset) => asset.kind === 'image');
    const audioAssets = mountedStep.assets.filter((asset) => asset.kind === 'audio');

    void (async () => {
      if (imageAsset) {
        setStatus('正在读取本题图形');
        try {
          const image = await getCurrentPatientAdministrationAsset(
            imageAsset.assetKey,
            controller.signal,
          );
          if (!mountedRef.current) return;
          const url = URL.createObjectURL(image.blob);
          imageUrlRef.current = url;
          setImageUrl(url);
        } catch (error: unknown) {
          if (controller.signal.aborted || !mountedRef.current) return;
          setStatus('本题图形读取失败');
          setMessage(patientErrorMessage(error));
          return;
        }
      }
      const played = await runAudioAssets(audioAssets);
      if (!mountedRef.current || !played) return;
      setAudioReady(true);
      setStatus(
        mountedStep.advanceBy === 'staff'
          ? '请按题目要求作答，并等待医护人员完成本步骤'
          : '题目已准备好，请完成本题回答',
      );
    })();

    return () => {
      mountedRef.current = false;
      controller.abort();
      audioCancelRef.current?.();
      audioCancelRef.current = null;
      audioRef.current?.pause();
      audioRef.current = null;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
      pendingAudioStartRef.current = null;
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    };
  }, [mountedStep, runAudioAssets]);

  const uploadEvidence = useCallback(
    async (
      input: Omit<PatientAdministrationEvidenceUploadInput, 'expectedRevision'>,
    ): Promise<boolean> => {
      if (mutationBusy) return false;
      setMutationBusy(true);
      setMessage(null);
      try {
        const uploaded = await uploadCurrentPatientAdministrationEvidence({
          ...input,
          expectedRevision: revisionRef.current,
        });
        publishRevision(uploaded.revision);
        return true;
      } catch (error: unknown) {
        await handleWriteError(error);
        return false;
      } finally {
        if (mountedRef.current) setMutationBusy(false);
      }
    },
    [handleWriteError, mutationBusy, publishRevision],
  );

  async function completeStep() {
    if (mutationBusy || responseBusy || audioBusy || !audioReady) return;
    setMutationBusy(true);
    setMessage(null);
    try {
      const current = await completeCurrentPatientAdministrationStep(
        revisionRef.current,
      );
      if (!mountedRef.current) return;
      revisionRef.current = current.revision;
      onCurrentChange(current);
    } catch (error: unknown) {
      await handleWriteError(error, true);
    } finally {
      if (mountedRef.current) setMutationBusy(false);
    }
  }

  const guidanceAssets = mountedStep.assets.filter(
    (asset) => asset.kind === 'audio' && asset.role === 'guidance',
  );
  const controlsDisabled = audioBusy || mutationBusy || responseBusy;

  return (
    <article className="grid gap-5" data-testid="patient-administration-current-step">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone="info">第 {mountedStep.order} / 19 步</Badge>
        <span className="text-base font-semibold text-[var(--cma-muted)]" role="status">{status}</span>
      </div>

      <h2 className="text-3xl font-semibold leading-tight text-[var(--cma-text-strong)] sm:text-4xl">
        {mountedStep.patientText}
      </h2>

      {imageUrl ? (
        // The source is a short-lived authenticated Blob URL and cannot use Next image optimization.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt="本题图形刺激"
          className="max-h-[32rem] w-full rounded-md border border-[var(--cma-line)] bg-white object-contain"
          data-testid="patient-administration-step-image"
          src={imageUrl}
        />
      ) : null}

      {showAudioStart ? (
        <Button className="min-h-12 w-full sm:w-fit" onClick={() => void pendingAudioStartRef.current?.start()} size="lg">
          播放题目语音
        </Button>
      ) : null}

      {audioReady && guidanceAssets.length > 0 ? (
        <Button className="w-full sm:w-fit" disabled={controlsDisabled} onClick={() => void runAudioAssets(guidanceAssets)} variant="secondary">
          再听一遍指导语
        </Button>
      ) : null}

      {audioReady && mountedStep.responseMode === 'speech' ? (
        <PatientAdministrationSpeechResponse disabled={controlsDisabled} onBusyChange={setResponseBusy} onUpload={uploadEvidence} />
      ) : null}

      {audioReady && (mountedStep.responseMode === 'writing' || mountedStep.responseMode === 'drawing') ? (
        <PatientAdministrationWrittenResponse disabled={controlsDisabled} onBusyChange={setResponseBusy} onUpload={uploadEvidence} responseMode={mountedStep.responseMode} />
      ) : null}

      {audioReady && mountedStep.responseMode === 'staff_observation' ? (
        <p className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] px-5 py-4 text-lg leading-8">
          请按题目要求完成动作，完成后由医护人员记录本步骤。
        </p>
      ) : null}

      {message ? <p className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 leading-7 text-[var(--cma-warning)]" role="alert">{message}</p> : null}

      {mountedStep.advanceBy === 'patient' ? (
        <Button className="min-h-12 w-full sm:w-fit" disabled={!audioReady || controlsDisabled} onClick={() => void completeStep()} size="lg">
          {mutationBusy ? '正在完成…' : '完成本题并继续'}
        </Button>
      ) : (
        <p className="font-semibold text-[var(--cma-info)]">本步骤由医护人员确认后继续。</p>
      )}

      <div className="border-t border-[var(--cma-line)] pt-4">
        <Button onClick={() => setHelpVisible((visible) => !visible)} variant="secondary">需要医护人员帮助</Button>
        {helpVisible ? <p className="mt-3 rounded-md bg-[var(--cma-info-soft)] px-4 py-3 leading-7 text-[var(--cma-info)]">请停止当前操作并告知身边医护人员。医护人员可以暂停施测并协助处理。</p> : null}
      </div>
    </article>
  );
}
