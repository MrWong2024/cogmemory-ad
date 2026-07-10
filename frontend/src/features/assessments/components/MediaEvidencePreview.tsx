'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/src/components/ui/Button';
import { isAccessUrlReusable } from '@/src/features/assessments/lib/media-evidence-display';
import type {
  MediaEvidence,
  MediaEvidenceAccessAsset,
  MediaEvidenceAccessUrlResponse,
} from '@/src/features/assessments/types/media-evidence';

function getExpiryDelay(
  access: MediaEvidenceAccessUrlResponse | undefined,
): number | null {
  if (!access) {
    return null;
  }

  const expiresAtMs = new Date(access.expiresAt).getTime();

  if (!Number.isFinite(expiresAtMs)) {
    return 0;
  }

  return Math.max(0, expiresAtMs - Date.now() - 30_000);
}

export function MediaEvidencePreview({
  accessErrors,
  evidence,
  loadingAssets,
  onRequestAccess,
  primaryAccess,
  trajectoryAccess,
}: {
  accessErrors: Partial<Record<MediaEvidenceAccessAsset, string>>;
  evidence: MediaEvidence;
  loadingAssets: ReadonlySet<MediaEvidenceAccessAsset>;
  onRequestAccess: (asset: MediaEvidenceAccessAsset) => void;
  primaryAccess: MediaEvidenceAccessUrlResponse | undefined;
  trajectoryAccess: MediaEvidenceAccessUrlResponse | undefined;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [primaryLoadFailed, setPrimaryLoadFailed] = useState(false);

  useEffect(() => {
    setNowMs(Date.now());
    setPrimaryLoadFailed(false);
  }, [primaryAccess?.expiresAt, primaryAccess?.url]);

  useEffect(() => {
    const delays = [
      getExpiryDelay(primaryAccess),
      getExpiryDelay(trajectoryAccess),
    ].filter((delay): delay is number => delay !== null);

    if (delays.length === 0) {
      return;
    }

    const delay = Math.min(...delays);

    if (delay <= 0) {
      setNowMs(Date.now());
      return;
    }

    const timeoutId = window.setTimeout(() => setNowMs(Date.now()), delay);
    return () => window.clearTimeout(timeoutId);
  }, [primaryAccess, trajectoryAccess]);

  const primaryIsFresh = isAccessUrlReusable(primaryAccess, nowMs);
  const trajectoryIsFresh = isAccessUrlReusable(trajectoryAccess, nowMs);
  const canAccess =
    evidence.status === 'attached' || evidence.status === 'locked';
  const hasTrajectory = evidence.handwritingTrace?.hasTrajectory === true;

  if (!canAccess) {
    return (
      <p className="text-sm leading-6 text-[var(--cma-muted)]">
        作废或删除状态的历史证据不请求临时访问地址。
      </p>
    );
  }

  return (
    <div className="grid gap-3 border-t border-[var(--cma-line)] pt-4">
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={loadingAssets.has('primary')}
          onClick={() => onRequestAccess('primary')}
          size="sm"
          variant="secondary"
        >
          {loadingAssets.has('primary')
            ? '正在获取图片地址...'
            : primaryIsFresh
              ? '刷新图片预览地址'
              : '加载图片预览'}
        </Button>
        {primaryIsFresh && primaryAccess ? (
          <a
            className="inline-flex min-h-9 items-center rounded-md border border-[var(--cma-line-strong)] px-3 py-1.5 text-sm font-semibold text-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)]"
            href={primaryAccess.url}
            referrerPolicy="no-referrer"
            rel="noreferrer noopener"
            target="_blank"
          >
            在新窗口打开图片
          </a>
        ) : null}
        {hasTrajectory ? (
          trajectoryIsFresh && trajectoryAccess ? (
            <a
              className="inline-flex min-h-9 items-center rounded-md border border-[var(--cma-line-strong)] px-3 py-1.5 text-sm font-semibold text-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)]"
              href={trajectoryAccess.url}
              referrerPolicy="no-referrer"
              rel="noreferrer noopener"
              target="_blank"
            >
              打开轨迹文件
            </a>
          ) : (
            <Button
              disabled={loadingAssets.has('trajectory')}
              onClick={() => onRequestAccess('trajectory')}
              size="sm"
              variant="secondary"
            >
              {loadingAssets.has('trajectory')
                ? '正在获取轨迹地址...'
                : '获取轨迹文件地址'}
            </Button>
          )
        ) : null}
      </div>

      {primaryIsFresh && primaryAccess && !primaryLoadFailed ? (
        // A short-lived external URL is intentionally rendered without changing Next image domains.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt="媒体证据图片预览"
          className="max-h-[32rem] w-full rounded-md border border-[var(--cma-line)] bg-white object-contain"
          onError={() => setPrimaryLoadFailed(true)}
          referrerPolicy="no-referrer"
          src={primaryAccess.url}
        />
      ) : null}

      {primaryLoadFailed ? (
        <p
          className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-3 py-2 text-sm text-[var(--cma-danger)]"
          role="alert"
        >
          图片预览加载失败，可手工重新获取临时地址。
        </p>
      ) : null}

      {accessErrors.primary ? (
        <p className="text-sm text-[var(--cma-danger)]" role="alert">
          {accessErrors.primary}
        </p>
      ) : null}
      {accessErrors.trajectory ? (
        <p className="text-sm text-[var(--cma-danger)]" role="alert">
          {accessErrors.trajectory}
        </p>
      ) : null}
    </div>
  );
}
