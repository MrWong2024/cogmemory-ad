'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { logout } from '@/src/features/auth/api/auth-api';
import { Badge, type BadgeTone } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import {
  AssessmentExecutionApiError,
  getAssessmentVisitExecutionDetail,
  initializeScaleInstance,
  listAvailableScales,
} from '@/src/features/assessments/api/assessment-execution-api';
import {
  ScaleInitializationPanel,
  type InitializationFeedback,
} from '@/src/features/assessments/components/ScaleInitializationPanel';
import { ClinicalReportPanel } from '@/src/features/assessments/components/ClinicalReportPanel';
import { ScaleInstanceList } from '@/src/features/assessments/components/ScaleInstanceList';
import { useClinicalReport } from '@/src/features/assessments/hooks/useClinicalReport';
import {
  assessmentOperatorRoleLabels,
  canInitializeScaleForVisit,
} from '@/src/features/assessments/lib/assessment-execution-display';
import type {
  AssessmentVisitExecutionDetailResponse,
  AvailableScaleOption,
  ScaleAdministrationMode,
  ScaleInstanceListItem,
} from '@/src/features/assessments/types/assessment-execution';
import {
  assessmentVisitStatusLabels,
  assessmentVisitTypeLabels,
  formatDateTime,
} from '@/src/features/patients/lib/patient-display';
import type { AssessmentVisitStatus } from '@/src/features/patients/types/patient';

const mongoIdPattern = /^[a-f\d]{24}$/i;
const emptyScaleInstances: ScaleInstanceListItem[] = [];

const secondaryLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-4 py-2 text-base font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

const visitStatusTones: Record<AssessmentVisitStatus, BadgeTone> = {
  draft: 'neutral',
  in_progress: 'info',
  completed: 'success',
  locked: 'warning',
  voided: 'warning',
};

type DetailErrorState = {
  title: string;
  description: string;
  badge: string;
  canRetry: boolean;
};

function getDetailErrorState(error: AssessmentExecutionApiError): DetailErrorState {
  if (error.kind === 'validation') {
    return {
      title: '访视链接无效',
      description: '当前地址中的患者或访视标识不符合要求。',
      badge: '链接无效',
      canRetry: false,
    };
  }

  if (error.kind === 'patient_not_found') {
    return {
      title: '未找到该患者档案',
      description: '该患者档案可能已不存在，请返回患者列表重新选择。',
      badge: '患者不存在',
      canRetry: false,
    };
  }

  if (error.kind === 'visit_not_found') {
    return {
      title: '未找到该评估访视',
      description: '该访视可能不存在，或不属于当前患者。',
      badge: '访视不存在',
      canRetry: false,
    };
  }

  if (error.kind === 'forbidden') {
    return {
      title: '当前账号没有访问评估访视的权限',
      description: '评估访视访问权限最终以后端校验结果为准。',
      badge: '无权限',
      canRetry: false,
    };
  }

  if (error.kind === 'service_unavailable') {
    return {
      title: '评估服务暂时不可用',
      description: '暂时无法加载访视详情，请稍后重试。',
      badge: '连接异常',
      canRetry: true,
    };
  }

  return {
    title: '暂时无法加载访视详情',
    description: '请稍后重新加载。',
    badge: '加载失败',
    canRetry: true,
  };
}

function getInitializationErrorMessage(
  error: AssessmentExecutionApiError,
): string {
  const messages: Partial<Record<AssessmentExecutionApiError['kind'], string>> = {
    validation: '初始化参数无效，请刷新页面后重试。',
    patient_not_active: '当前患者不是活动状态，无法初始化量表。',
    visit_not_initializable: '当前访视状态不允许初始化新的量表。',
    scale_not_available: '该量表当前不可用，请刷新目录后重试。',
    scale_version_not_available:
      '该量表版本当前不可用，请刷新目录后重试。',
    scale_not_active: '该量表已停用，无法初始化。',
    scale_version_not_active: '该量表版本已停用，无法初始化。',
    scale_catalog_invalid:
      '量表目录暂时不可用，请联系系统管理员或稍后重试。',
    scale_catalog_version_conflict:
      '量表配置版本存在冲突，当前无法初始化。',
    scale_execution_initialization_failed: '量表初始化失败，请稍后重试。',
    service_unavailable: '评估服务暂时不可用，请稍后重试。',
    forbidden: '当前账号没有初始化量表实例的权限。',
  };

  return messages[error.kind] ?? '量表初始化失败，请稍后重试。';
}

function sortScaleInstances(
  instances: ScaleInstanceListItem[],
): ScaleInstanceListItem[] {
  return [...instances].sort(
    (left, right) =>
      left.scaleCode.localeCompare(right.scaleCode) ||
      left.instanceNo - right.instanceNo,
  );
}

export function AssessmentVisitExecutionPage({
  patientId,
  visitId,
}: {
  patientId: string;
  visitId: string;
}) {
  const router = useRouter();
  const mountedRef = useRef(true);
  const initializingScaleCodeRef = useRef<string | null>(null);
  const idsAreValid =
    mongoIdPattern.test(patientId) && mongoIdPattern.test(visitId);
  const [detail, setDetail] =
    useState<AssessmentVisitExecutionDetailResponse | null>(null);
  const [detailError, setDetailError] =
    useState<AssessmentExecutionApiError | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(true);
  const [detailRetryKey, setDetailRetryKey] = useState(0);
  const [scales, setScales] = useState<AvailableScaleOption[] | null>(null);
  const [catalogError, setCatalogError] =
    useState<AssessmentExecutionApiError | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [catalogRetryKey, setCatalogRetryKey] = useState(0);
  const [initializingScaleCode, setInitializingScaleCode] = useState<
    string | null
  >(null);
  const [initializationFeedback, setInitializationFeedback] =
    useState<InitializationFeedback | null>(null);
  const [knownExistingScaleCodes, setKnownExistingScaleCodes] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleUnauthorized = useCallback(() => {
    router.replace('/login');
  }, [router]);
  const handleRefreshVisitDetail = useCallback(() => {
    setDetailRetryKey((value) => value + 1);
  }, []);
  const detailMatchesRoute =
    detail !== null &&
    detail.visit.id.trim().toLowerCase() === visitId.trim().toLowerCase() &&
    detail.visit.patientId.trim().toLowerCase() ===
      patientId.trim().toLowerCase();
  const reportState = useClinicalReport({
    patientId,
    visitId,
    enabled: detailMatchesRoute,
    visitStatus: detailMatchesRoute ? detail.visit.status : null,
    scaleInstances: detailMatchesRoute
      ? detail.scaleInstances
      : emptyScaleInstances,
    externalWriteBlockReason: isDetailLoading
      ? '访视详情正在加载，请等待完成后再生成报告。'
      : initializingScaleCode !== null
        ? '量表初始化正在进行，请等待完成后再生成报告。'
        : null,
    onUnauthorized: handleUnauthorized,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!idsAreValid) {
      setDetail(null);
      setDetailError(new AssessmentExecutionApiError('validation', 400));
      setIsDetailLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsDetailLoading(true);
    setDetailError(null);

    void getAssessmentVisitExecutionDetail(patientId, visitId, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!controller.signal.aborted) {
          setDetail({
            ...response,
            scaleInstances: sortScaleInstances(response.scaleInstances),
          });
        }
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (
          requestError instanceof AssessmentExecutionApiError &&
          requestError.kind === 'unauthenticated'
        ) {
          router.replace('/login');
          return;
        }

        setDetail(null);
        setDetailError(
          requestError instanceof AssessmentExecutionApiError
            ? requestError
            : new AssessmentExecutionApiError('unknown'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsDetailLoading(false);
        }
      });

    return () => controller.abort();
  }, [detailRetryKey, idsAreValid, patientId, router, visitId]);

  useEffect(() => {
    if (!idsAreValid) {
      setScales(null);
      setCatalogError(null);
      setIsCatalogLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsCatalogLoading(true);
    setCatalogError(null);

    void listAvailableScales({ signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setScales(response.items);
        }
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (
          requestError instanceof AssessmentExecutionApiError &&
          requestError.kind === 'unauthenticated'
        ) {
          router.replace('/login');
          return;
        }

        setScales(null);
        setCatalogError(
          requestError instanceof AssessmentExecutionApiError
            ? requestError
            : new AssessmentExecutionApiError('unknown'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsCatalogLoading(false);
        }
      });

    return () => controller.abort();
  }, [catalogRetryKey, idsAreValid, router]);

  const existingScaleCodes = useMemo(
    () => {
      const codes = new Set(knownExistingScaleCodes);

      detail?.scaleInstances.forEach((instance) => {
        codes.add(instance.scaleCode.toLowerCase());
      });

      return codes;
    },
    [detail?.scaleInstances, knownExistingScaleCodes],
  );

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      await logout();
    } catch {
      // The login page will confirm the final server-side session state.
    } finally {
      if (mountedRef.current) {
        router.replace('/login');
      }
    }
  }

  async function handleInitialize(
    scale: AvailableScaleOption,
    administrationMode: ScaleAdministrationMode,
  ) {
    const normalizedCode = scale.code.toLowerCase();

    if (
      !detail ||
      reportState.generating ||
      initializingScaleCodeRef.current !== null ||
      existingScaleCodes.has(normalizedCode) ||
      !canInitializeScaleForVisit(detail.visit.status)
    ) {
      return;
    }

    initializingScaleCodeRef.current = normalizedCode;
    setInitializingScaleCode(normalizedCode);
    setInitializationFeedback(null);

    try {
      const response = await initializeScaleInstance(patientId, visitId, {
        scaleCode: scale.code,
        scaleVersion: scale.version,
        administrationMode,
      });

      if (!mountedRef.current) {
        return;
      }

      setDetail((current) => {
        if (!current) {
          return current;
        }

        const otherInstances = current.scaleInstances.filter(
          (instance) =>
            instance.scaleCode.toLowerCase() !==
            response.scaleInstance.scaleCode.toLowerCase(),
        );

        return {
          ...current,
          scaleInstances: sortScaleInstances([
            ...otherInstances,
            response.scaleInstance,
          ]),
        };
      });
      setKnownExistingScaleCodes((current) => {
        const next = new Set(current);
        next.add(response.scaleInstance.scaleCode.toLowerCase());
        return next;
      });
      setInitializationFeedback({
        kind: 'success',
        message: `已初始化 ${response.scale.shortName || response.scale.code.toUpperCase()}，共创建 ${response.createdItemResponseCount} 条题目记录骨架。现在可从实例列表打开量表进行逐题草稿记录。`,
      });
    } catch (requestError: unknown) {
      if (!mountedRef.current) {
        return;
      }

      const error =
        requestError instanceof AssessmentExecutionApiError
          ? requestError
          : new AssessmentExecutionApiError('unknown');

      if (error.kind === 'unauthenticated') {
        router.replace('/login');
        return;
      }

      if (error.kind === 'patient_not_found' || error.kind === 'visit_not_found') {
        setDetail(null);
        setDetailError(error);
        return;
      }

      if (error.kind === 'forbidden') {
        setDetail(null);
        setDetailError(error);
        return;
      }

      if (error.kind === 'scale_instance_already_exists') {
        setKnownExistingScaleCodes((current) => {
          const next = new Set(current);
          next.add(normalizedCode);
          return next;
        });
        setInitializationFeedback({
          kind: 'info',
          message: '当前访视已初始化该量表，正在刷新访视详情。',
        });
        setDetailRetryKey((value) => value + 1);
        return;
      }

      if (
        error.kind === 'scale_not_available' ||
        error.kind === 'scale_version_not_available'
      ) {
        setCatalogRetryKey((value) => value + 1);
      }

      setInitializationFeedback({
        kind: 'error',
        message: getInitializationErrorMessage(error),
      });
    } finally {
      initializingScaleCodeRef.current = null;

      if (mountedRef.current) {
        setInitializingScaleCode(null);
      }
    }
  }

  if (isDetailLoading && !detail) {
    return (
      <Card aria-live="polite" role="status">
        <CardHeader>
          <CardTitle>正在加载访视详情</CardTitle>
          <CardDescription>
            正在读取访视与已初始化量表实例，请稍候。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (detailError || !detail) {
    const error = detailError ?? new AssessmentExecutionApiError('unknown');
    const state = getDetailErrorState(error);
    const canReturnToPatient =
      mongoIdPattern.test(patientId) && error.kind !== 'patient_not_found';

    return (
      <Card role="alert">
        <CardHeader>
          <Badge tone="warning">{state.badge}</Badge>
          <CardTitle>{state.title}</CardTitle>
          <CardDescription>{state.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {state.canRetry ? (
            <Button onClick={() => setDetailRetryKey((value) => value + 1)}>
              重新加载
            </Button>
          ) : null}
          {canReturnToPatient ? (
            <Link
              className={secondaryLinkClassName}
              href={`/patients/${encodeURIComponent(patientId)}`}
            >
              返回患者详情
            </Link>
          ) : null}
          <Link className={secondaryLinkClassName} href="/patients">
            返回患者列表
          </Link>
          <Link className={secondaryLinkClassName} href="/dashboard">
            返回工作台
          </Link>
          {error.kind === 'forbidden' ? (
            <Button
              disabled={isSigningOut}
              onClick={() => void handleSignOut()}
              variant="secondary"
            >
              {isSigningOut ? '正在退出...' : '退出登录'}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const visit = detail.visit;
  const visitCanInitialize = canInitializeScaleForVisit(visit.status);

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--cma-line)] pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">访视详情</Badge>
            {isDetailLoading ? <Badge>详情更新中</Badge> : null}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-[var(--cma-text-strong)] sm:text-4xl">
            {visit.visitCode}
          </h1>
          <p className="mt-2 text-lg leading-8 text-[var(--cma-muted)]">
            患者 / 受试者编号：{visit.subjectCode}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            className={secondaryLinkClassName}
            href={`/patients/${encodeURIComponent(patientId)}`}
          >
            返回患者详情
          </Link>
          <Link className={secondaryLinkClassName} href="/patients">
            返回患者列表
          </Link>
          <Link className={secondaryLinkClassName} href="/dashboard">
            返回工作台
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader className="border-b border-[var(--cma-line)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>访视执行信息</CardTitle>
              <CardDescription>
                展示当前访视公开字段与状态时间，不提供访视编辑或状态流转。
              </CardDescription>
            </div>
            <Badge tone={visitStatusTones[visit.status]}>
              {assessmentVisitStatusLabels[visit.status]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                访视编号
              </dt>
              <dd className="mt-1 text-lg font-semibold text-[var(--cma-text-strong)]">
                {visit.visitCode}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                患者 / 受试者编号
              </dt>
              <dd className="mt-1 text-lg font-semibold text-[var(--cma-text-strong)]">
                {visit.subjectCode}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                访视类型
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {assessmentVisitTypeLabels[visit.visitType]}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                访视状态
              </dt>
              <dd className="mt-2">
                <Badge tone={visitStatusTones[visit.status]}>
                  {assessmentVisitStatusLabels[visit.status]}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                评估时间
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {formatDateTime(visit.assessmentDate)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                操作者
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {visit.operatorSnapshot?.operatorName || '未记录'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                操作者角色
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {visit.operatorSnapshot?.operatorRole
                  ? assessmentOperatorRoleLabels[
                      visit.operatorSnapshot.operatorRole
                    ]
                  : '未记录'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                开始时间
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {formatDateTime(visit.startedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                完成时间
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {formatDateTime(visit.completedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                锁定时间
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {formatDateTime(visit.lockedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                作废时间
              </dt>
              <dd className="mt-1 text-lg text-[var(--cma-text-strong)]">
                {formatDateTime(visit.voidedAt)}
              </dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                备注
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-base leading-7 text-[var(--cma-text-strong)]">
                {visit.notes || '—'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <ScaleInstanceList
        catalog={scales}
        instances={detail.scaleInstances}
        visitCanInitialize={visitCanInitialize}
      />

      <ClinicalReportPanel
        catalog={scales}
        instances={detail.scaleInstances}
        onRefreshVisitDetail={handleRefreshVisitDetail}
        patientId={patientId}
        reportState={reportState}
        visitId={visitId}
      />

      <ScaleInitializationPanel
        catalogError={catalogError}
        existingScaleCodes={existingScaleCodes}
        externalBusyReason={
          reportState.generating
            ? '正在生成规则化报告草稿，量表初始化提交已临时停用。'
            : null
        }
        feedback={initializationFeedback}
        initializingScaleCode={initializingScaleCode}
        isCatalogLoading={isCatalogLoading}
        onInitialize={handleInitialize}
        onRetryCatalog={() => setCatalogRetryKey((value) => value + 1)}
        scales={scales}
        visitCanInitialize={visitCanInitialize}
      />
    </div>
  );
}
