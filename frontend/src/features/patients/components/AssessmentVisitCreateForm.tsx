'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

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
  createPatientVisit,
  getPatient,
  PatientsApiError,
} from '@/src/features/patients/api/patients-api';
import { PatientStatusBadge } from '@/src/features/patients/components/PatientStatusBadge';
import {
  assessmentVisitTypeLabels,
  assessmentVisitTypes,
  toAssessmentDateIso,
} from '@/src/features/patients/lib/patient-display';
import type {
  AssessmentVisitType,
  CreateAssessmentVisitRequest,
  PatientDetail,
} from '@/src/features/patients/types/patient';

const mongoIdPattern = /^[a-f\d]{24}$/i;

const secondaryLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-4 py-2 text-base font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

const inputClassName =
  'min-h-12 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3.5 py-2.5 text-base text-[var(--cma-text-strong)] outline-none transition-colors placeholder:text-[var(--cma-subtle)] focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)]';

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function isAssessmentVisitType(value: string): value is AssessmentVisitType {
  return assessmentVisitTypes.some((visitType) => visitType === value);
}

function getPatientLoadMessage(error: PatientsApiError): string {
  if (error.kind === 'validation') {
    return '患者链接无效';
  }

  if (error.kind === 'patient_not_found') {
    return '未找到该患者档案';
  }

  if (error.kind === 'forbidden') {
    return '当前账号没有访问患者档案的权限。';
  }

  if (error.kind === 'service_unavailable') {
    return '患者档案服务暂时不可用，请稍后重试。';
  }

  return '暂时无法加载患者档案，请稍后重试。';
}

export function AssessmentVisitCreateForm({
  patientId,
}: {
  patientId: string;
}) {
  const router = useRouter();
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [patientError, setPatientError] = useState<PatientsApiError | null>(
    null,
  );
  const [isPatientLoading, setIsPatientLoading] = useState(true);
  const [patientRetryKey, setPatientRetryKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [visitCodeError, setVisitCodeError] = useState<string | null>(null);

  useEffect(() => {
    if (!mongoIdPattern.test(patientId)) {
      setPatientError(new PatientsApiError('validation', 400));
      setIsPatientLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsPatientLoading(true);
    setPatientError(null);

    void getPatient(patientId, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setPatient(response);
        }
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (
          requestError instanceof PatientsApiError &&
          requestError.kind === 'unauthenticated'
        ) {
          router.replace('/login');
          return;
        }

        setPatientError(
          requestError instanceof PatientsApiError
            ? requestError
            : new PatientsApiError('unknown'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsPatientLoading(false);
        }
      });

    return () => controller.abort();
  }, [patientId, patientRetryKey, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || !patient || patient.status !== 'active') {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const visitCode = readString(formData, 'visitCode').toUpperCase();
    const visitType = readString(formData, 'visitType');
    const assessmentDate = readString(formData, 'assessmentDate');
    const notes = readString(formData, 'notes');

    setFormError(null);
    setVisitCodeError(null);

    if (!visitCode || visitCode.length > 80) {
      setVisitCodeError('请输入不超过 80 个字符的访视编号。');
      return;
    }

    if (!isAssessmentVisitType(visitType)) {
      setFormError('请选择有效的访视类型。');
      return;
    }

    const assessmentDateIso = toAssessmentDateIso(assessmentDate);

    if (!assessmentDateIso) {
      setFormError('请输入有效的评估日期时间。');
      return;
    }

    if (notes.length > 2000) {
      setFormError('备注不能超过 2000 个字符。');
      return;
    }

    const input: CreateAssessmentVisitRequest = {
      visitCode,
      visitType,
      assessmentDate: assessmentDateIso,
      ...(notes ? { notes } : {}),
    };

    setIsSubmitting(true);

    try {
      await createPatientVisit(patientId, input);
      router.replace(`/patients/${encodeURIComponent(patientId)}`);
    } catch (error: unknown) {
      if (error instanceof PatientsApiError) {
        if (error.kind === 'unauthenticated') {
          router.replace('/login');
          return;
        }

        if (error.kind === 'visit_code_conflict') {
          setVisitCodeError('该访视编号已存在，请更换后重试。');
        } else if (error.kind === 'patient_not_active') {
          setFormError('当前患者不是活动状态，无法创建评估访视。');
        } else if (error.kind === 'patient_not_found') {
          setPatient(null);
          setPatientError(error);
        } else if (error.kind === 'validation') {
          setFormError('请检查填写内容后重试。');
        } else if (error.kind === 'forbidden') {
          setFormError('当前账号没有访问患者档案的权限。');
        } else if (error.kind === 'service_unavailable') {
          setFormError('评估访视服务暂时不可用，请稍后重试。');
        } else {
          setFormError('创建评估访视失败，请稍后重试。');
        }
      } else {
        setFormError('创建评估访视失败，请稍后重试。');
      }

      setIsSubmitting(false);
    }
  }

  if (isPatientLoading) {
    return (
      <Card aria-live="polite" role="status">
        <CardHeader>
          <CardTitle>正在读取患者信息</CardTitle>
          <CardDescription>
            正在确认本次评估访视对应的患者，请稍候。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (patientError || !patient) {
    const error = patientError ?? new PatientsApiError('unknown');

    return (
      <Card role="alert">
        <CardHeader>
          <Badge tone="warning">
            {error.kind === 'forbidden' ? '无权限' : '无法访问'}
          </Badge>
          <CardTitle>{getPatientLoadMessage(error)}</CardTitle>
          <CardDescription>
            无法确认当前创建对象，因此未显示访视表单。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {error.kind !== 'validation' &&
          error.kind !== 'patient_not_found' &&
          error.kind !== 'forbidden' ? (
            <Button onClick={() => setPatientRetryKey((value) => value + 1)}>
              重新加载
            </Button>
          ) : null}
          <Link className={secondaryLinkClassName} href="/patients">
            返回患者列表
          </Link>
          <Link className={secondaryLinkClassName} href="/dashboard">
            返回工作台
          </Link>
        </CardContent>
      </Card>
    );
  }

  const patientDetailPath = `/patients/${encodeURIComponent(patient.id)}`;

  return (
    <div className="grid gap-6">
      <header className="border-b border-[var(--cma-line)] pb-6">
        <Badge tone="info">评估访视</Badge>
        <h1 className="mt-3 text-3xl font-semibold text-[var(--cma-text-strong)] sm:text-4xl">
          新建评估访视
        </h1>
        <p className="mt-2 max-w-3xl text-lg leading-8 text-[var(--cma-muted)]">
          当前患者：
          <strong className="font-semibold text-[var(--cma-text-strong)]">
            {patient.subjectCode}
          </strong>
          {patient.displayName ? ` · ${patient.displayName}` : ''}
        </p>
      </header>

      <Card>
        <CardHeader className="border-b border-[var(--cma-line)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl">当前创建对象</CardTitle>
              <CardDescription>
                提交前请再次确认患者编号与展示名称。
              </CardDescription>
            </div>
            <PatientStatusBadge status={patient.status} />
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <dl className="grid gap-5 sm:grid-cols-3">
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                患者编号
              </dt>
              <dd className="mt-1 text-lg font-semibold text-[var(--cma-text-strong)]">
                {patient.subjectCode}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                展示名称
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {patient.displayName || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                患者状态
              </dt>
              <dd className="mt-2">
                <PatientStatusBadge status={patient.status} />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {patient.status !== 'active' ? (
        <Card role="status">
          <CardHeader>
            <Badge tone="warning">不可创建</Badge>
            <CardTitle>当前患者不是活动状态，无法创建评估访视。</CardTitle>
            <CardDescription>
              后端患者状态规则是最终判断，本页不会提交创建请求。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link className={secondaryLinkClassName} href={patientDetailPath}>
              返回患者详情
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>访视信息</CardTitle>
            <CardDescription>
              操作者将由系统根据当前登录账号自动记录。当前只创建访视，不会自动创建
              MMSE / MoCA 量表实例，也不会启动计分或报告流程。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-6" onSubmit={handleSubmit}>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="grid gap-2">
                  <label
                    className="font-semibold text-[var(--cma-text-strong)]"
                    htmlFor="visitCode"
                  >
                    访视编号（必填）
                  </label>
                  <input
                    aria-describedby={
                      visitCodeError ? 'visitCode-error' : undefined
                    }
                    aria-invalid={Boolean(visitCodeError)}
                    autoComplete="off"
                    className={inputClassName}
                    disabled={isSubmitting}
                    id="visitCode"
                    maxLength={80}
                    name="visitCode"
                    placeholder="请输入机构内部使用的脱敏访视编号"
                    required
                    spellCheck={false}
                    type="text"
                  />
                  {visitCodeError ? (
                    <p
                      className="text-sm leading-6 text-[var(--cma-danger)]"
                      id="visitCode-error"
                      role="alert"
                    >
                      {visitCodeError}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <label
                    className="font-semibold text-[var(--cma-text-strong)]"
                    htmlFor="visitType"
                  >
                    访视类型
                  </label>
                  <select
                    className={inputClassName}
                    defaultValue="baseline"
                    disabled={isSubmitting}
                    id="visitType"
                    name="visitType"
                  >
                    {assessmentVisitTypes.map((visitType) => (
                      <option key={visitType} value={visitType}>
                        {assessmentVisitTypeLabels[visitType]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2 md:col-span-2">
                  <label
                    className="font-semibold text-[var(--cma-text-strong)]"
                    htmlFor="assessmentDate"
                  >
                    评估日期时间（必填）
                  </label>
                  <input
                    className={inputClassName}
                    disabled={isSubmitting}
                    id="assessmentDate"
                    name="assessmentDate"
                    required
                    type="datetime-local"
                  />
                  <p className="text-sm text-[var(--cma-muted)]">
                    将按浏览器本地时间解释，并以 ISO 时间点提交。
                  </p>
                </div>

                <div className="grid gap-2 md:col-span-2">
                  <label
                    className="font-semibold text-[var(--cma-text-strong)]"
                    htmlFor="notes"
                  >
                    备注
                  </label>
                  <textarea
                    className={`${inputClassName} min-h-36 resize-y`}
                    disabled={isSubmitting}
                    id="notes"
                    maxLength={2000}
                    name="notes"
                    placeholder="可选，最多 2000 个字符"
                    rows={5}
                  />
                </div>
              </div>

              {formError ? (
                <p
                  aria-live="polite"
                  className="rounded-md border border-[var(--cma-danger)] bg-[var(--cma-danger-soft)] px-4 py-3 text-base leading-7 text-[var(--cma-danger)]"
                  role="alert"
                >
                  {formError}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3 border-t border-[var(--cma-line)] pt-5">
                <Button disabled={isSubmitting} size="lg" type="submit">
                  {isSubmitting ? '正在创建并跳转...' : '创建评估访视'}
                </Button>
                <Link
                  className={secondaryLinkClassName}
                  href={patientDetailPath}
                >
                  取消
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
