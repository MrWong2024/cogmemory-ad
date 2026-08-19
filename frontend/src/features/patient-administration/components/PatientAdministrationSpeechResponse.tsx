'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/src/components/ui/Button';
import type { PatientAdministrationEvidenceUploadInput } from '@/src/features/patient-administration/types/patient-administration';

const MAX_RECORDING_MS = 600_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
] as const;

type PendingRecording = {
  blob: Blob;
  capturedAt: string;
  durationMs: number;
};

type Props = {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onUpload: (
    input: Omit<PatientAdministrationEvidenceUploadInput, 'expectedRevision'>,
  ) => Promise<boolean>;
};

export function PatientAdministrationSpeechResponse({
  disabled,
  onBusyChange,
  onUpload,
}: Props) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const capturedAtRef = useRef('');
  const mountedRef = useRef(true);
  const startRunRef = useRef(0);
  const startInFlightRef = useRef(false);
  const savingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<PendingRecording | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function clearPreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setPending(null);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startRunRef.current += 1;
      startInFlightRef.current = false;
      savingRef.current = false;
      clearTimer();
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder?.state === 'recording') recorder.stop();
      stopTracks();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      onBusyChange(false);
    };
  }, [onBusyChange]);

  function chooseMimeType(): string | null {
    if (typeof MediaRecorder === 'undefined') return null;
    return (
      SUPPORTED_MIME_TYPES.find((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType),
      ) ?? null
    );
  }

  async function startRecording() {
    if (
      startInFlightRef.current ||
      starting ||
      recording ||
      uploading ||
      saved ||
      disabled
    ) {
      return;
    }
    const mimeType = chooseMimeType();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      setError('当前浏览器不支持本题录音，请告知医护人员更换设备或接管。');
      return;
    }
    const run = startRunRef.current + 1;
    startRunRef.current = run;
    startInFlightRef.current = true;
    setStarting(true);
    onBusyChange(true);
    clearPreview();
    setError(null);
    let acquiredStream: MediaStream | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      acquiredStream = stream;
      if (!mountedRef.current || startRunRef.current !== run) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType });
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = performance.now();
      capturedAtRef.current = new Date().toISOString();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        clearTimer();
        stopTracks();
        if (startRunRef.current === run) startInFlightRef.current = false;
        if (mountedRef.current && startRunRef.current === run) {
          setStarting(false);
          setRecording(false);
          onBusyChange(false);
          setError('录音未能正常完成，请重试或告知医护人员。');
        }
      };
      recorder.onstop = () => {
        clearTimer();
        stopTracks();
        recorderRef.current = null;
        if (startRunRef.current === run) startInFlightRef.current = false;
        if (!mountedRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        setStarting(false);
        setRecording(false);
        onBusyChange(false);
        if (blob.size === 0) {
          setError('没有录到有效内容，请重新录制。');
          return;
        }
        const nextPending = {
          blob,
          capturedAt: capturedAtRef.current,
          durationMs: Math.max(
            1,
            Math.min(MAX_RECORDING_MS, Math.round(performance.now() - startedAtRef.current)),
          ),
        };
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPending(nextPending);
        setPreviewUrl(url);
      };
      recorder.start();
      setStarting(false);
      setRecording(true);
      timerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, MAX_RECORDING_MS);
    } catch {
      recorderRef.current = null;
      if (streamRef.current === acquiredStream) {
        stopTracks();
      } else {
        acquiredStream?.getTracks().forEach((track) => track.stop());
      }
      if (startRunRef.current === run) startInFlightRef.current = false;
      if (mountedRef.current && startRunRef.current === run) {
        setStarting(false);
        setRecording(false);
        onBusyChange(false);
        setError('麦克风权限或设备不可用，请告知医护人员协助。');
      }
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  }

  async function saveRecording() {
    if (savingRef.current || !pending || uploading || saved) return;
    const normalizedMimeType = pending.blob.type.split(';')[0].toLowerCase();
    if (
      pending.blob.size > MAX_FILE_BYTES ||
      !['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'].includes(
        normalizedMimeType,
      )
    ) {
      setError('录音格式或大小不符合要求，请重新录制。');
      return;
    }
    savingRef.current = true;
    setUploading(true);
    onBusyChange(true);
    setError(null);
    try {
      const uploaded = await onUpload({
        file: pending.blob,
        evidenceType: 'audio',
        capturedAt: pending.capturedAt,
        durationMs: pending.durationMs,
      });
      if (uploaded && mountedRef.current) {
        clearPreview();
        setSaved(true);
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) {
        setUploading(false);
        onBusyChange(false);
      }
    }
  }

  return (
    <section className="grid gap-4 rounded-md border border-[var(--cma-line)] p-4" aria-labelledby="speech-response-title">
      <div>
        <h3 className="text-xl font-semibold" id="speech-response-title">录制本题回答</h3>
        <p className="mt-1 text-base leading-7 text-[var(--cma-muted)]">
          请先点击开始录音，再按题目要求作答；录完可以先试听，再显式保存。
        </p>
      </div>

      {recording ? (
        <p className="rounded-md bg-[var(--cma-warning-soft)] px-4 py-3 font-semibold text-[var(--cma-warning)]" role="status">
          正在录音
        </p>
      ) : null}

      {previewUrl ? (
        <audio aria-label="试听本题回答" className="w-full" controls src={previewUrl} />
      ) : null}

      {saved ? (
        <p className="rounded-md bg-[var(--cma-success-soft)] px-4 py-3 font-semibold text-[var(--cma-success)]" role="status">
          回答已保存
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {!recording && !pending && !saved ? (
          <Button className="min-h-12" disabled={disabled || starting || uploading} onClick={() => void startRecording()} size="lg">
            开始录音
          </Button>
        ) : null}
        {recording ? (
          <Button className="min-h-12" onClick={stopRecording} size="lg">结束录音</Button>
        ) : null}
        {pending && !recording && !saved ? (
          <>
            <Button className="min-h-12" disabled={disabled || uploading} onClick={() => void saveRecording()} size="lg">
              {uploading ? '正在保存…' : '保存本题回答'}
            </Button>
            <Button disabled={disabled || uploading} onClick={() => { clearPreview(); setError(null); }} variant="secondary">
              重新录制
            </Button>
          </>
        ) : null}
      </div>

      {error ? <p className="text-[var(--cma-danger)]" role="alert">{error}</p> : null}
    </section>
  );
}
