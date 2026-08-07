'use client';

import { useState, type FormEvent } from 'react';

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
  enterPatientAdministration,
  PatientAdministrationApiError,
} from '@/src/features/patient-administration/api/patient-administration-api';

function getErrorMessage(error: unknown): string {
  if (!(error instanceof PatientAdministrationApiError)) {
    return '服务暂不可用，请稍后手动重试。';
  }
  if (error.kind === 'entry_invalid') {
    return '进入码无效或已过期，请联系医护人员重新获取。';
  }
  if (error.kind === 'rate_limited') {
    return error.remainingSeconds
      ? `尝试次数较多，请等待 ${error.remainingSeconds} 秒后手动重试。`
      : '尝试次数较多，请稍后手动重试。';
  }
  if (error.kind === 'session_conflict') {
    return '当前浏览器仍处于医护登录状态。请在原量表页面使用同设备交接，或换一台设备输入。';
  }
  if (error.kind === 'validation') {
    return '请输入六位数字进入码。';
  }
  return '服务暂不可用，请稍后手动重试。';
}

export function PatientAdministrationEnterPage() {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code) || submitting) {
      setErrorMessage('请输入六位数字进入码。');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await enterPatientAdministration(code);
      setCode('');
      window.location.replace('/patient-administration');
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-[var(--cma-line)]">
        <Badge tone="info">安全进入</Badge>
        <CardTitle className="text-3xl">输入六位进入码</CardTitle>
        <CardDescription className="text-lg">
          请向身边的医护人员获取本次施测的进入码。系统不会在此判断或显示患者身份。
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <form className="grid gap-5" onSubmit={(event) => void handleSubmit(event)}>
          <label className="grid gap-2 text-lg font-semibold text-[var(--cma-text-strong)]">
            六位数字进入码
            <input
              autoComplete="one-time-code"
              className="min-h-14 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-4 text-center text-3xl font-semibold tracking-[0.35em] text-[var(--cma-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]"
              disabled={submitting}
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => {
                setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6));
                setErrorMessage(null);
              }}
              pattern="[0-9]{6}"
              value={code}
            />
          </label>
          {errorMessage ? (
            <p
              className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-warning)]"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
          <Button
            className="min-h-12 w-full text-lg"
            disabled={submitting || code.length !== 6}
            size="lg"
            type="submit"
          >
            {submitting ? '正在安全进入…' : '进入患者施测'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
