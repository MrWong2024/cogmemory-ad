'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  patientAdministrationImpactFactorLabels,
} from '@/src/features/patient-administration/lib/patient-administration-display';
import type { PatientAdministrationImpactFactorCode } from '@/src/features/patient-administration/types/patient-administration';

export type PatientAdministrationPreparationValue = {
  ready: boolean;
  impactFactorCodes: PatientAdministrationImpactFactorCode[];
  impactFactorNote: string;
};

type PreparationFact = 'screen' | 'input' | 'sound' | 'microphone';

type Props = {
  disabled?: boolean;
  resetKey: string;
  showImpactFactors?: boolean;
  showLocalPreparation?: boolean;
  onChange?: (value: PatientAdministrationPreparationValue) => void;
};

const requiredPreparationFacts: ReadonlyArray<{
  key: PreparationFact;
  label: string;
}> = [
  { key: 'screen', label: '屏幕显示与方向已确认' },
  { key: 'input', label: '触摸、鼠标等基本操作可用' },
  { key: 'sound', label: '本地测试音已检查' },
  { key: 'microphone', label: '麦克风已检查，或已明确当前不可用' },
];

const initialFacts: Record<PreparationFact, boolean> = {
  screen: false,
  input: false,
  sound: false,
  microphone: false,
};

const checkboxClassName =
  'mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

export function PatientAdministrationPreparation({
  disabled = false,
  resetKey,
  showImpactFactors = false,
  showLocalPreparation = true,
  onChange,
}: Props) {
  const [facts, setFacts] = useState(initialFacts);
  const [impactFactorCodes, setImpactFactorCodes] = useState<
    PatientAdministrationImpactFactorCode[]
  >([]);
  const [impactFactorNote, setImpactFactorNote] = useState('');
  const [soundStatus, setSoundStatus] = useState<string | null>(null);
  const [microphoneStatus, setMicrophoneStatus] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  const microphoneRunRef = useRef(0);

  const ready =
    !showLocalPreparation ||
    requiredPreparationFacts.every(({ key }) => facts[key]);
  const completedPreparationFactCount = requiredPreparationFacts.filter(
    ({ key }) => facts[key],
  ).length;

  const releaseMicrophone = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const revokeRecordingUrl = useCallback(() => {
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = null;
    }
    setRecordingUrl(null);
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') {
      recorder.stop();
      return;
    }
    releaseMicrophone();
  }, [releaseMicrophone]);

  useEffect(() => {
    onChange?.({
      ready,
      impactFactorCodes,
      impactFactorNote,
    });
  }, [impactFactorCodes, impactFactorNote, onChange, ready]);

  useEffect(() => {
    microphoneRunRef.current += 1;
    setFacts(initialFacts);
    setImpactFactorCodes([]);
    setImpactFactorNote('');
    setSoundStatus(null);
    setMicrophoneStatus(null);
    drawingRef.current = false;
    lastPointRef.current = null;
    const context = canvasRef.current?.getContext('2d');
    if (context && canvasRef.current) {
      context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    stopRecording();
    releaseMicrophone();
    revokeRecordingUrl();
  }, [releaseMicrophone, resetKey, revokeRecordingUrl, stopRecording]);

  useEffect(
    () => () => {
      microphoneRunRef.current += 1;
      const recorder = recorderRef.current;
      if (recorder?.state === 'recording') recorder.stop();
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    },
    [],
  );

  function updateFact(key: PreparationFact, checked: boolean) {
    setFacts((current) => ({ ...current, [key]: checked }));
  }

  async function playTestTone() {
    setSoundStatus('正在播放短测试音…');
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 440;
      gain.gain.value = 0.035;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.35);
      await new Promise<void>((resolve) => {
        oscillator.addEventListener('ended', () => resolve(), { once: true });
      });
      updateFact('sound', true);
      setSoundStatus('本地短测试音已播放，请确认音量舒适。');
    } catch {
      setSoundStatus('浏览器未能播放测试音，请检查静音、音量或设备权限。');
    } finally {
      await context?.close().catch(() => undefined);
    }
  }

  async function startMicrophoneCheck() {
    const microphoneRun = ++microphoneRunRef.current;
    stopRecording();
    releaseMicrophone();
    revokeRecordingUrl();
    setMicrophoneStatus('正在请求麦克风权限…');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      updateFact('microphone', true);
      setMicrophoneStatus('当前浏览器不支持本地录音，已明确记录麦克风不可用。');
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (microphoneRun !== microphoneRunRef.current) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }
      const activeStream = stream;
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(activeStream);
      streamRef.current = activeStream;
      recorderRef.current = recorder;
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorder.addEventListener(
        'stop',
        () => {
          for (const track of activeStream.getTracks()) track.stop();
          if (streamRef.current === activeStream) streamRef.current = null;
          if (recorderRef.current === recorder) recorderRef.current = null;
          if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          if (microphoneRun !== microphoneRunRef.current) return;
          setRecording(false);
          if (chunks.length > 0) {
            const url = URL.createObjectURL(
              new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }),
            );
            recordingUrlRef.current = url;
            setRecordingUrl(url);
            updateFact('microphone', true);
            setMicrophoneStatus('本地录音已完成，可在本设备回放检查。');
          } else {
            setMicrophoneStatus('未取得可回放的本地录音，请重试或记录不可用。');
          }
        },
        { once: true },
      );
      recorder.start();
      setRecording(true);
      setMicrophoneStatus('正在本地录音，最长 10 秒；内容不会上传或保存。');
      timerRef.current = window.setTimeout(() => stopRecording(), 10_000);
    } catch {
      if (microphoneRun !== microphoneRunRef.current) {
        for (const track of stream?.getTracks() ?? []) {
          track.stop();
        }
        return;
      }
      for (const track of stream?.getTracks() ?? []) {
        track.stop();
      }
      releaseMicrophone();
      updateFact('microphone', true);
      setMicrophoneStatus('麦克风权限或设备不可用，已明确记录当前不可用。');
    }
  }

  function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function beginDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = canvasPoint(event);
  }

  function continueDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return;
    const previous = lastPointRef.current;
    const current = canvasPoint(event);
    const context = event.currentTarget.getContext('2d');
    if (context && previous) {
      context.strokeStyle = '#2f6f73';
      context.lineWidth = 4;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(current.x, current.y);
      context.stroke();
    }
    lastPointRef.current = current;
  }

  function endDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }

  function toggleImpactFactor(code: PatientAdministrationImpactFactorCode) {
    setImpactFactorCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
  }

  return (
    <div className="grid gap-6" data-testid="patient-administration-preparation">
      {showLocalPreparation ? (
        <section aria-labelledby="local-preparation-title" className="grid gap-4">
          <div>
            <h3
              className="text-xl font-semibold text-[var(--cma-text-strong)]"
              id="local-preparation-title"
            >
              施测前设备检查
            </h3>
            <p className="mt-1 text-base leading-7 text-[var(--cma-muted)]">
              以下检查仅用于确认当前设备可正常施测；测试内容只保留在本机，不上传、不计分。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {requiredPreparationFacts.map(({ key, label }) => (
              <label
                className="flex min-h-12 gap-3 rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] px-4 py-3 text-base leading-7"
                key={key}
              >
                <input
                  checked={facts[key]}
                  className={checkboxClassName}
                  disabled={
                    disabled || key === 'sound' || key === 'microphone'
                  }
                  onChange={(event) => updateFact(key, event.target.checked)}
                  type="checkbox"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-[var(--cma-line)] p-4">
              <h4 className="font-semibold text-[var(--cma-text-strong)]">
                音量检查
              </h4>
              <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
                点击后播放约 0.35 秒、低音量的本地合成音。
              </p>
              <Button
                className="mt-3"
                disabled={disabled}
                onClick={() => void playTestTone()}
                variant="secondary"
              >
                播放本地测试音
              </Button>
              {soundStatus ? (
                <p
                  aria-live="polite"
                  className="mt-3 text-sm leading-6"
                  role="status"
                >
                  {soundStatus}
                </p>
              ) : null}
            </div>

            <div className="rounded-md border border-[var(--cma-line)] p-4">
              <h4 className="font-semibold text-[var(--cma-text-strong)]">
                麦克风检查
              </h4>
              <p className="mt-1 text-sm leading-6 text-[var(--cma-muted)]">
                最长录制 10 秒，仅生成当前页面可回放的临时 Blob。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  disabled={disabled || recording}
                  onClick={() => void startMicrophoneCheck()}
                  variant="secondary"
                >
                  {recording ? '正在录音…' : '开始本地录音检查'}
                </Button>
                {recording ? (
                  <Button onClick={stopRecording} variant="secondary">
                    停止录音
                  </Button>
                ) : null}
              </div>
              {microphoneStatus ? (
                <p
                  aria-live="polite"
                  className="mt-3 text-sm leading-6"
                  role="status"
                >
                  {microphoneStatus}
                </p>
              ) : null}
              {recordingUrl ? (
                <audio
                  aria-label="本地麦克风检查回放"
                  className="mt-3 w-full"
                  controls
                  src={recordingUrl}
                />
              ) : null}
            </div>
          </div>

          <details className="rounded-md border border-[var(--cma-line)] p-4">
            <summary className="cursor-pointer font-semibold text-[var(--cma-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]">
              设备操作练习（可选）
            </summary>
            <div className="mt-4 grid gap-4">
              <p className="text-sm leading-6 text-[var(--cma-muted)]">
                患者不熟悉触摸或书写操作时可先练习；如已熟悉设备，可直接跳过。练习不使用正式刺激，不上传、不保存、不计分。
              </p>
              <div className="flex justify-end">
                <Button
                  disabled={disabled}
                  onClick={clearCanvas}
                  variant="secondary"
                >
                  清空练习
                </Button>
              </div>
              <canvas
                aria-label="不计分触摸和书写练习画布"
                className="h-56 w-full touch-none rounded-md border border-dashed border-[var(--cma-line-strong)] bg-white"
                height={240}
                onPointerCancel={endDrawing}
                onPointerDown={beginDrawing}
                onPointerMove={continueDrawing}
                onPointerUp={endDrawing}
                ref={canvasRef}
                width={720}
              />
            </div>
          </details>

          <div
            aria-live="polite"
            className="flex flex-wrap items-center gap-3"
            role="status"
          >
            <Badge tone={ready ? 'success' : 'neutral'}>
              {ready ? '必要设备检查已完成' : '必要设备检查尚未完成'}
            </Badge>
            <span className="text-sm text-[var(--cma-muted)]">
              已完成 {completedPreparationFactCount} /{' '}
              {requiredPreparationFacts.length} 项
            </span>
          </div>
        </section>
      ) : null}

      {showImpactFactors ? (
        <fieldset className="grid gap-4" disabled={disabled}>
          <legend className="text-xl font-semibold text-[var(--cma-text-strong)]">
            正式影响因素确认
          </legend>
          <p className="text-base leading-7 text-[var(--cma-muted)]">
            可多选；无明显影响因素时保持空白。此处不表示诊断或严重程度。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {patientAdministrationImpactFactorLabels.map(({ code, label }) => (
              <label
                className="flex min-h-12 gap-3 rounded-md border border-[var(--cma-line)] px-4 py-3"
                key={code}
              >
                <input
                  checked={impactFactorCodes.includes(code)}
                  className={checkboxClassName}
                  onChange={() => toggleImpactFactor(code)}
                  type="checkbox"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <label className="grid gap-2 font-semibold text-[var(--cma-text-strong)]">
            影响因素备注（可选，最多 500 字）
            <textarea
              className="min-h-28 rounded-md border border-[var(--cma-line-strong)] bg-white px-3 py-2 font-normal text-[var(--cma-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]"
              maxLength={500}
              onChange={(event) => setImpactFactorNote(event.target.value)}
              value={impactFactorNote}
            />
          </label>
        </fieldset>
      ) : null}
    </div>
  );
}
