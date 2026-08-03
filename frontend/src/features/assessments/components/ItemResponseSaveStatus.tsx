'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/src/components/ui/Button';
import type { ItemResponseAutosaveSnapshot } from '@/src/features/assessments/lib/item-response-autosave';
import { formatDateTime } from '@/src/features/patients/lib/patient-display';

type ConflictChoice = 'server' | 'local' | null;

function getStatusText(snapshot: ItemResponseAutosaveSnapshot): string {
  if (snapshot.state === 'clean') {
    return snapshot.serverItem.draftSavedAt
      ? `已保存：${formatDateTime(snapshot.serverItem.draftSavedAt)}`
      : '当前没有未保存修改';
  }

  const labels = {
    dirty: '未保存',
    invalid: '内容不完整，尚未保存',
    queued: '等待自动保存',
    saving: '正在保存',
    waiting_for_network: '离线，等待联网',
    reconciling: '正在核对服务器',
    conflict: '发现版本冲突',
    blocked: '当前记录已不可编辑',
  } as const;

  return labels[snapshot.state];
}

export function ItemResponseSaveStatus({
  onRetryServerCheck,
  onUseLocalVersion,
  onUseServerVersion,
  snapshot,
}: {
  onRetryServerCheck: () => void;
  onUseLocalVersion: () => void;
  onUseServerVersion: () => void;
  snapshot: ItemResponseAutosaveSnapshot;
}) {
  const [choice, setChoice] = useState<ConflictChoice>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (snapshot.state !== 'conflict') {
      setChoice(null);
      setConfirmed(false);
    }
  }, [snapshot.state]);

  const isAlert =
    snapshot.state === 'conflict' || snapshot.state === 'blocked';

  return (
    <section
      aria-live={isAlert ? undefined : 'polite'}
      className={
        isAlert
          ? 'grid gap-3 rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-[var(--cma-danger)]'
          : snapshot.state === 'clean'
            ? 'grid gap-2 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-success-soft)] px-4 py-3 text-[var(--cma-success)]'
            : 'grid gap-2 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-[var(--cma-warning)]'
      }
      role={isAlert ? 'alert' : 'status'}
    >
      <p className="font-semibold">{getStatusText(snapshot)}</p>
      {snapshot.validationMessage ? (
        <p className="text-sm leading-6">{snapshot.validationMessage}</p>
      ) : null}
      {snapshot.message ? (
        <p className="text-sm leading-6">{snapshot.message}</p>
      ) : null}

      {snapshot.state === 'reconciling' ? (
        <div>
          <Button onClick={onRetryServerCheck} size="sm" variant="secondary">
            重新核对服务器
          </Button>
        </div>
      ) : null}

      {snapshot.state === 'conflict' ? (
        <div className="grid gap-3">
          <p className="text-sm leading-6">
            本地修改仍被保留。系统不会自动覆盖服务器版本或本地版本。
          </p>
          {!snapshot.conflictServerAvailable ? (
            <div>
              <Button
                onClick={onRetryServerCheck}
                size="sm"
                variant="secondary"
              >
                重新读取服务器版本
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => {
                    setChoice('server');
                    setConfirmed(false);
                  }}
                  size="sm"
                  variant="secondary"
                >
                  使用服务器版本
                </Button>
                <Button
                  onClick={() => {
                    setChoice('local');
                    setConfirmed(false);
                  }}
                  size="sm"
                  variant="secondary"
                >
                  使用本地版本重新保存
                </Button>
              </div>
              {choice ? (
                <div className="grid gap-3 rounded-md border border-current p-3">
                  <p className="text-sm font-semibold leading-6">
                    {choice === 'server'
                      ? '此操作会放弃本题当前本地修改，并采用最新服务器版本；不会发送 PATCH。'
                      : '此操作会保留本地修改，以最新服务器版本号显式保存一次；若再次冲突，系统仍会停止并等待选择。'}
                  </p>
                  <label className="flex items-start gap-3 text-sm font-semibold leading-6">
                    <input
                      checked={confirmed}
                      className="mt-1 h-5 w-5 shrink-0 accent-[var(--cma-primary)]"
                      onChange={(event) => setConfirmed(event.target.checked)}
                      type="checkbox"
                    />
                    我已理解这次版本选择的影响。
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={!confirmed}
                      onClick={() => {
                        if (choice === 'server') {
                          onUseServerVersion();
                        } else {
                          onUseLocalVersion();
                        }
                      }}
                      size="sm"
                    >
                      确认执行
                    </Button>
                    <Button
                      onClick={() => {
                        setChoice(null);
                        setConfirmed(false);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      取消
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

