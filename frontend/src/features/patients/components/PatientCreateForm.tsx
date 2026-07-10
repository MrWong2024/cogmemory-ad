'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
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
  createPatient,
  PatientsApiError,
} from '@/src/features/patients/api/patients-api';
import {
  parsePatientTags,
  patientHandednesses,
  patientHandednessLabels,
  patientSexes,
  patientSexLabels,
  patientSourceLabels,
  patientSourceTypes,
  toBirthDateIso,
} from '@/src/features/patients/lib/patient-display';
import type {
  CreatePatientRequest,
  PatientHandedness,
  PatientSex,
  PatientSourceType,
} from '@/src/features/patients/types/patient';

const secondaryLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-4 py-2 text-base font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

const inputClassName =
  'min-h-12 w-full rounded-md border border-[var(--cma-line-strong)] bg-white px-3.5 py-2.5 text-base text-[var(--cma-text-strong)] outline-none transition-colors placeholder:text-[var(--cma-subtle)] focus:border-[var(--cma-primary)] focus:ring-2 focus:ring-[var(--cma-ring)] disabled:bg-[var(--cma-surface-muted)]';

function readRequiredString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function isPatientSourceType(value: string): value is PatientSourceType {
  return patientSourceTypes.some((sourceType) => sourceType === value);
}

function isPatientSex(value: string): value is PatientSex {
  return patientSexes.some((sex) => sex === value);
}

function isPatientHandedness(value: string): value is PatientHandedness {
  return patientHandednesses.some((handedness) => handedness === value);
}

export function PatientCreateForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [subjectCodeError, setSubjectCodeError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const subjectCode = readRequiredString(formData, 'subjectCode').toUpperCase();
    const displayName = readRequiredString(formData, 'displayName');
    const sourceType = readRequiredString(formData, 'sourceType');
    const sex = readRequiredString(formData, 'sex');
    const birthDate = readRequiredString(formData, 'birthDate');
    const educationYearsValue = readRequiredString(
      formData,
      'educationYears',
    );
    const handedness = readRequiredString(formData, 'handedness');
    const tags = parsePatientTags(readRequiredString(formData, 'tags'));
    const notes = readRequiredString(formData, 'notes');

    setFormError(null);
    setSubjectCodeError(null);

    if (!subjectCode || subjectCode.length > 80) {
      setSubjectCodeError('请输入不超过 80 个字符的患者 / 受试者编号。');
      return;
    }

    if (displayName.length > 120) {
      setFormError('展示名称不能超过 120 个字符。');
      return;
    }

    if (!isPatientSourceType(sourceType) || !isPatientSex(sex)) {
      setFormError('请选择有效的数据来源和性别。');
      return;
    }

    const birthDateIso = birthDate ? toBirthDateIso(birthDate) : null;

    if (birthDate && !birthDateIso) {
      setFormError('请输入有效的出生日期。');
      return;
    }

    let educationYears: number | undefined;

    if (educationYearsValue) {
      educationYears = Number(educationYearsValue);

      if (
        !Number.isInteger(educationYears) ||
        educationYears < 0 ||
        educationYears > 40
      ) {
        setFormError('教育年限须为 0 至 40 之间的整数。');
        return;
      }
    }

    if (!isPatientHandedness(handedness)) {
      setFormError('请选择有效的利手信息。');
      return;
    }

    if (tags.length > 20 || tags.some((tag) => tag.length > 50)) {
      setFormError('标签最多 20 项，且每项不能超过 50 个字符。');
      return;
    }

    if (notes.length > 2000) {
      setFormError('备注不能超过 2000 个字符。');
      return;
    }

    const input: CreatePatientRequest = {
      subjectCode,
      sourceType,
      sex,
      handedness,
      ...(displayName ? { displayName } : {}),
      ...(birthDateIso ? { birthDate: birthDateIso } : {}),
      ...(educationYears !== undefined ? { educationYears } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      ...(notes ? { notes } : {}),
    };

    setIsSubmitting(true);

    try {
      const patient = await createPatient(input);
      router.replace(`/patients/${encodeURIComponent(patient.id)}`);
    } catch (error: unknown) {
      if (error instanceof PatientsApiError) {
        if (error.kind === 'unauthenticated') {
          router.replace('/login');
          return;
        }

        if (error.kind === 'patient_code_conflict') {
          setSubjectCodeError('该患者编号已存在，请更换后重试。');
        } else if (error.kind === 'validation') {
          setFormError('请检查填写内容后重试。');
        } else if (error.kind === 'forbidden') {
          setFormError('当前账号没有访问患者档案的权限。');
        } else if (error.kind === 'service_unavailable') {
          setFormError('患者档案服务暂时不可用，请稍后重试。');
        } else {
          setFormError('创建患者档案失败，请稍后重试。');
        }
      } else {
        setFormError('创建患者档案失败，请稍后重试。');
      }

      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <header className="border-b border-[var(--cma-line)] pb-6">
        <Badge tone="info">患者档案</Badge>
        <h1 className="mt-3 text-3xl font-semibold text-[var(--cma-text-strong)] sm:text-4xl">
          新建患者
        </h1>
        <p className="mt-2 max-w-3xl text-lg leading-8 text-[var(--cma-muted)]">
          建立患者 / 受试者公开档案。创建后将进入详情页继续查看评估访视。
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>档案信息</CardTitle>
          <CardDescription>
            标有“必填”的字段必须填写；展示名称仅用于界面识别。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-6" onSubmit={handleSubmit}>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="grid gap-2">
                <label
                  className="font-semibold text-[var(--cma-text-strong)]"
                  htmlFor="subjectCode"
                >
                  患者 / 受试者编号（必填）
                </label>
                <input
                  aria-describedby={
                    subjectCodeError ? 'subjectCode-error' : undefined
                  }
                  aria-invalid={Boolean(subjectCodeError)}
                  autoComplete="off"
                  className={inputClassName}
                  disabled={isSubmitting}
                  id="subjectCode"
                  maxLength={80}
                  name="subjectCode"
                  placeholder="请输入机构内部使用的脱敏编号"
                  required
                  spellCheck={false}
                  type="text"
                />
                {subjectCodeError ? (
                  <p
                    className="text-sm leading-6 text-[var(--cma-danger)]"
                    id="subjectCode-error"
                    role="alert"
                  >
                    {subjectCodeError}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <label
                  className="font-semibold text-[var(--cma-text-strong)]"
                  htmlFor="displayName"
                >
                  展示名称
                </label>
                <input
                  autoComplete="off"
                  className={inputClassName}
                  disabled={isSubmitting}
                  id="displayName"
                  maxLength={120}
                  name="displayName"
                  placeholder="可选，仅用于界面识别"
                  type="text"
                />
              </div>

              <div className="grid gap-2">
                <label
                  className="font-semibold text-[var(--cma-text-strong)]"
                  htmlFor="sourceType"
                >
                  数据来源
                </label>
                <select
                  className={inputClassName}
                  defaultValue="clinical"
                  disabled={isSubmitting}
                  id="sourceType"
                  name="sourceType"
                >
                  {patientSourceTypes.map((sourceType) => (
                    <option key={sourceType} value={sourceType}>
                      {patientSourceLabels[sourceType]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <label
                  className="font-semibold text-[var(--cma-text-strong)]"
                  htmlFor="sex"
                >
                  性别
                </label>
                <select
                  className={inputClassName}
                  defaultValue="unknown"
                  disabled={isSubmitting}
                  id="sex"
                  name="sex"
                >
                  {patientSexes.map((sex) => (
                    <option key={sex} value={sex}>
                      {patientSexLabels[sex]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <label
                  className="font-semibold text-[var(--cma-text-strong)]"
                  htmlFor="birthDate"
                >
                  出生日期
                </label>
                <input
                  className={inputClassName}
                  disabled={isSubmitting}
                  id="birthDate"
                  name="birthDate"
                  type="date"
                />
              </div>

              <div className="grid gap-2">
                <label
                  className="font-semibold text-[var(--cma-text-strong)]"
                  htmlFor="educationYears"
                >
                  教育年限
                </label>
                <input
                  className={inputClassName}
                  disabled={isSubmitting}
                  id="educationYears"
                  max={40}
                  min={0}
                  name="educationYears"
                  placeholder="0–40 的整数"
                  step={1}
                  type="number"
                />
              </div>

              <div className="grid gap-2">
                <label
                  className="font-semibold text-[var(--cma-text-strong)]"
                  htmlFor="handedness"
                >
                  利手
                </label>
                <select
                  className={inputClassName}
                  defaultValue="unknown"
                  disabled={isSubmitting}
                  id="handedness"
                  name="handedness"
                >
                  {patientHandednesses.map((handedness) => (
                    <option key={handedness} value={handedness}>
                      {patientHandednessLabels[handedness]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2 md:col-span-2">
                <label
                  className="font-semibold text-[var(--cma-text-strong)]"
                  htmlFor="tags"
                >
                  标签
                </label>
                <textarea
                  className={`${inputClassName} min-h-28 resize-y`}
                  disabled={isSubmitting}
                  id="tags"
                  name="tags"
                  placeholder="可用逗号、中文逗号或换行分隔，最多 20 项"
                  rows={3}
                />
                <p className="text-sm text-[var(--cma-muted)]">
                  系统会移除空项和重复项，每项最长 50 个字符。
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
                {isSubmitting ? '正在创建并跳转...' : '创建患者档案'}
              </Button>
              <Link className={secondaryLinkClassName} href="/patients">
                取消
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
