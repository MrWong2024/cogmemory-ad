'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

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
  getScaleInstanceExecutionDetail,
  saveItemResponseDraft,
} from '@/src/features/assessments/api/assessment-execution-api';
import {
  ItemResponseEditor,
  type ItemSaveFeedback,
} from '@/src/features/assessments/components/ItemResponseEditor';
import { ScaleExecutionGroupNavigation } from '@/src/features/assessments/components/ScaleExecutionGroupNavigation';
import {
  assessmentOperatorRoleLabels,
  buildScaleExecutionGroupSections,
  getItemResponseSaveErrorMessage,
  getScaleExecutionReadOnlyReason,
  scaleAdministrationModeLabels,
  scaleInstanceStatusLabels,
} from '@/src/features/assessments/lib/assessment-execution-display';
import {
  buildItemResponseDraftRequest,
  createItemDraftState,
  itemDraftHasChanges,
  type ItemDraftState,
} from '@/src/features/assessments/lib/item-response-draft';
import type { ScaleInstanceExecutionDetailResponse } from '@/src/features/assessments/types/item-response-execution';
import { logout } from '@/src/features/auth/api/auth-api';
import {
  assessmentVisitStatusLabels,
  assessmentVisitTypeLabels,
  formatDateTime,
} from '@/src/features/patients/lib/patient-display';
import type { AssessmentVisitStatus } from '@/src/features/patients/types/patient';

const mongoIdPattern = /^[a-f\d]{24}$/i;

const secondaryLinkClassName =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-surface)] px-4 py-2 text-base font-semibold text-[var(--cma-text-strong)] transition-colors hover:border-[var(--cma-primary)] hover:bg-[var(--cma-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cma-ring)]';

const statusTones: Record<AssessmentVisitStatus, BadgeTone> = {
  draft: 'neutral',
  in_progress: 'info',
  completed: 'success',
  locked: 'warning',
  voided: 'warning',
};

type ExecutionDetailErrorState = {
  badge: string;
  title: string;
  description: string;
  canRetry: boolean;
};

function getExecutionDetailErrorState(
  error: AssessmentExecutionApiError,
): ExecutionDetailErrorState {
  if (error.kind === 'validation') {
    return {
      badge: '链接无效',
      title: '量表实例链接无效',
      description: '当前地址中的患者、访视或量表实例标识不符合要求。',
      canRetry: false,
    };
  }

  if (error.kind === 'patient_not_found') {
    return {
      badge: '患者不存在',
      title: '未找到该患者档案',
      description: '该患者档案可能已不存在，请返回患者列表重新选择。',
      canRetry: false,
    };
  }

  if (error.kind === 'visit_not_found') {
    return {
      badge: '访视不存在',
      title: '未找到该评估访视',
      description: '该访视可能不存在，或不属于当前患者。',
      canRetry: false,
    };
  }

  if (error.kind === 'scale_instance_not_found') {
    return {
      badge: '实例不存在',
      title: '未找到该量表实例',
      description: '该量表实例可能不存在，或不属于当前患者与访视。',
      canRetry: false,
    };
  }

  if (error.kind === 'scale_instance_configuration_unavailable') {
    return {
      badge: '配置不可用',
      title: '量表实例配置暂时不可用',
      description:
        '该量表实例的版本配置暂时不可用，当前无法进入施测记录。',
      canRetry: true,
    };
  }

  if (error.kind === 'forbidden') {
    return {
      badge: '无权限',
      title: '当前账号没有访问该量表实例的权限',
      description: '评估访问权限最终以后端校验结果为准。',
      canRetry: false,
    };
  }

  if (error.kind === 'service_unavailable') {
    return {
      badge: '连接异常',
      title: '评估服务暂时不可用',
      description: '暂时无法加载量表执行详情，请稍后重试。',
      canRetry: true,
    };
  }

  return {
    badge: '加载失败',
    title: '暂时无法加载量表执行详情',
    description: '请稍后重新加载。',
    canRetry: true,
  };
}

function createDraftMap(
  detail: ScaleInstanceExecutionDetailResponse,
): Record<string, ItemDraftState> {
  return Object.fromEntries(
    detail.itemResponses.map((item) => [item.id, createItemDraftState(item)]),
  );
}

export function ScaleInstanceExecutionPage({
  patientId,
  scaleInstanceId,
  visitId,
}: {
  patientId: string;
  scaleInstanceId: string;
  visitId: string;
}) {
  const router = useRouter();
  const mountedRef = useRef(true);
  const savingItemIdsRef = useRef(new Set<string>());
  const idsAreValid =
    mongoIdPattern.test(patientId) &&
    mongoIdPattern.test(visitId) &&
    mongoIdPattern.test(scaleInstanceId);
  const [detail, setDetail] =
    useState<ScaleInstanceExecutionDetailResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ItemDraftState>>({});
  const [feedbacks, setFeedbacks] = useState<
    Record<string, ItemSaveFeedback | undefined>
  >({});
  const [savingItemIds, setSavingItemIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [detailError, setDetailError] =
    useState<AssessmentExecutionApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [activeGroupCode, setActiveGroupCode] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!idsAreValid) {
      setDetail(null);
      setDrafts({});
      setDetailError(new AssessmentExecutionApiError('validation', 400));
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setDetailError(null);

    void getScaleInstanceExecutionDetail(
      patientId,
      visitId,
      scaleInstanceId,
      { signal: controller.signal },
    )
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        const sections = buildScaleExecutionGroupSections(
          response.groups,
          response.itemResponses,
        );
        setDetail(response);
        setDrafts(createDraftMap(response));
        setFeedbacks({});
        setActiveGroupCode(sections[0]?.code ?? '');
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
        setDrafts({});
        setDetailError(
          requestError instanceof AssessmentExecutionApiError
            ? requestError
            : new AssessmentExecutionApiError('unknown'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [idsAreValid, patientId, retryKey, router, scaleInstanceId, visitId]);

  const sections = useMemo(
    () =>
      detail
        ? buildScaleExecutionGroupSections(detail.groups, detail.itemResponses)
        : [],
    [detail],
  );
  const activeSection =
    sections.find((section) => section.code === activeGroupCode) ?? sections[0];
  const effectiveActiveGroupCode = activeSection?.code ?? '';
  const unsavedItemCount = useMemo(() => {
    if (!detail) {
      return 0;
    }

    return detail.itemResponses.filter((item) => {
      const draft = drafts[item.id];
      return draft ? itemDraftHasChanges(item, draft) : false;
    }).length;
  }, [detail, drafts]);

  useEffect(() => {
    if (unsavedItemCount === 0) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [unsavedItemCount]);

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

  function handleDraftChange(itemResponseId: string, draft: ItemDraftState) {
    setDrafts((current) => ({ ...current, [itemResponseId]: draft }));
    setFeedbacks((current) => ({
      ...current,
      [itemResponseId]: undefined,
    }));
  }

  async function handleSaveItem(
    itemResponseId: string,
    markAsAnswered: boolean,
  ) {
    if (!detail || savingItemIdsRef.current.has(itemResponseId)) {
      return;
    }

    const item = detail.itemResponses.find(
      (candidate) => candidate.id === itemResponseId,
    );
    const draft = drafts[itemResponseId];

    if (!item || !draft) {
      return;
    }

    const buildResult = buildItemResponseDraftRequest(
      item,
      draft,
      markAsAnswered,
    );

    if (!buildResult.ok) {
      setFeedbacks((current) => ({
        ...current,
        [itemResponseId]: { kind: 'error', message: buildResult.message },
      }));
      return;
    }

    if (!buildResult.hasChanges) {
      setDrafts((current) => ({
        ...current,
        [itemResponseId]: createItemDraftState(item),
      }));
      setFeedbacks((current) => ({
        ...current,
        [itemResponseId]: {
          kind: 'info',
          message: '没有需要保存的更改。',
        },
      }));
      return;
    }

    savingItemIdsRef.current.add(itemResponseId);
    setSavingItemIds((current) => new Set([...current, itemResponseId]));
    setFeedbacks((current) => ({
      ...current,
      [itemResponseId]: undefined,
    }));

    try {
      const response = await saveItemResponseDraft(
        patientId,
        visitId,
        scaleInstanceId,
        itemResponseId,
        buildResult.input,
      );

      if (!mountedRef.current) {
        return;
      }

      setDetail((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          scaleInstance: {
            ...current.scaleInstance,
            progress: {
              totalItemCount: response.progress.totalItemCount,
              answeredItemCount: Math.max(
                current.scaleInstance.progress.answeredItemCount,
                response.progress.answeredItemCount,
              ),
            },
          },
          itemResponses: current.itemResponses.map((currentItem) =>
            currentItem.id === itemResponseId
              ? response.itemResponse
              : currentItem,
          ),
        };
      });
      setDrafts((current) => ({
        ...current,
        [itemResponseId]: createItemDraftState(response.itemResponse),
      }));
      setFeedbacks((current) => ({
        ...current,
        [itemResponseId]: {
          kind: 'success',
          message: markAsAnswered
            ? '本题草稿已保存，并由服务端标记为本题完成。'
            : '本题草稿已保存。',
        },
      }));
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

      setFeedbacks((current) => ({
        ...current,
        [itemResponseId]: {
          kind: 'error',
          message: getItemResponseSaveErrorMessage(error.kind),
        },
      }));
    } finally {
      savingItemIdsRef.current.delete(itemResponseId);

      if (mountedRef.current) {
        setSavingItemIds((current) => {
          const next = new Set(current);
          next.delete(itemResponseId);
          return next;
        });
      }
    }
  }

  if (isLoading && !detail) {
    return (
      <Card aria-live="polite" role="status">
        <CardHeader>
          <CardTitle>正在加载量表执行详情</CardTitle>
          <CardDescription>
            正在读取访视、量表分组、安全题目与当前草稿，请稍候。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (detailError || !detail) {
    const error = detailError ?? new AssessmentExecutionApiError('unknown');
    const state = getExecutionDetailErrorState(error);
    const canReturnToVisit =
      mongoIdPattern.test(patientId) && mongoIdPattern.test(visitId);

    return (
      <Card role="alert">
        <CardHeader>
          <Badge tone="warning">{state.badge}</Badge>
          <CardTitle>{state.title}</CardTitle>
          <CardDescription>{state.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {state.canRetry ? (
            <Button onClick={() => setRetryKey((value) => value + 1)}>
              重新加载
            </Button>
          ) : null}
          {canReturnToVisit ? (
            <Link
              className={secondaryLinkClassName}
              href={`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}`}
            >
              返回访视详情
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

  const { scale, scaleInstance, visit } = detail;
  const readOnlyReason = getScaleExecutionReadOnlyReason(
    visit.status,
    scaleInstance.status,
  );
  const progressPercent =
    scaleInstance.progress.totalItemCount > 0
      ? Math.min(
          100,
          Math.round(
            (scaleInstance.progress.answeredItemCount /
              scaleInstance.progress.totalItemCount) *
              100,
          ),
        )
      : 0;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--cma-line)] pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">量表施测执行</Badge>
            {readOnlyReason ? <Badge tone="warning">只读查看</Badge> : null}
            {unsavedItemCount > 0 ? (
              <Badge tone="warning">{unsavedItemCount} 题未保存</Badge>
            ) : (
              <Badge tone="success">没有未保存修改</Badge>
            )}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-[var(--cma-text-strong)] sm:text-4xl">
            {scale.name}
            {scale.shortName ? `（${scale.shortName}）` : ''}
          </h1>
          <p className="mt-2 text-lg leading-8 text-[var(--cma-muted)]">
            患者 / 受试者编号：{visit.subjectCode} · 访视：
            {visit.visitCode}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            className={secondaryLinkClassName}
            href={`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}`}
          >
            返回访视详情
          </Link>
          <Link
            className={secondaryLinkClassName}
            href={`/patients/${encodeURIComponent(patientId)}`}
          >
            返回患者详情
          </Link>
          <Link className={secondaryLinkClassName} href="/dashboard">
            返回工作台
          </Link>
        </div>
      </header>

      <p className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] px-5 py-4 text-base leading-7 text-[var(--cma-info)]">
        核心认知量表应由医护或研究人员陪伴或监督完成。本页仅逐题记录原始作答草稿，不提供整份提交、评分、媒体上传、报告或 AI。
      </p>

      {readOnlyReason ? (
        <p
          className="rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-warning-soft)] px-5 py-4 text-base leading-7 text-[var(--cma-warning)]"
          role="status"
        >
          {readOnlyReason} 历史安全草稿不会隐藏，所有编辑和保存操作已禁用。
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader className="border-b border-[var(--cma-line)]">
            <CardTitle>访视信息</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
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
                  访视类型 / 状态
                </dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 text-base text-[var(--cma-text-strong)]">
                  {assessmentVisitTypeLabels[visit.visitType]}
                  <Badge tone={statusTones[visit.status]}>
                    {assessmentVisitStatusLabels[visit.status]}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  评估时间
                </dt>
                <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                  {formatDateTime(visit.assessmentDate)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-[var(--cma-line)]">
            <CardTitle>量表与版本</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  量表编码 / 版本
                </dt>
                <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                  {scale.code.toUpperCase()} ·{' '}
                  {scale.displayVersion
                    ? `${scale.displayVersion}（${scale.version}）`
                    : scale.version}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  CRF 版本
                </dt>
                <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                  {scale.crfVersion || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  来源文档
                </dt>
                <dd className="mt-1 break-words text-base text-[var(--cma-text-strong)]">
                  {scale.sourceDocument || '—'}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-[var(--cma-line)]">
            <CardTitle>实例与进度</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  实例编号 / 状态
                </dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 text-base text-[var(--cma-text-strong)]">
                  {scaleInstance.instanceCode} · 第 {scaleInstance.instanceNo} 份
                  <Badge tone={statusTones[scaleInstance.status]}>
                    {scaleInstanceStatusLabels[scaleInstance.status]}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  施测方式
                </dt>
                <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                  {scaleAdministrationModeLabels[
                    scaleInstance.administrationMode
                  ]}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  操作者
                </dt>
                <dd className="mt-1 text-base text-[var(--cma-text-strong)]">
                  {scaleInstance.operatorSnapshot?.operatorName || '未记录'}
                  {scaleInstance.operatorSnapshot?.operatorRole
                    ? `（${
                        assessmentOperatorRoleLabels[
                          scaleInstance.operatorSnapshot.operatorRole
                        ]
                      }）`
                    : ''}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-[var(--cma-muted)]">
                  当前真实进度
                </dt>
                <dd className="mt-1 text-lg font-semibold text-[var(--cma-text-strong)]">
                  {scaleInstance.progress.answeredItemCount} /{' '}
                  {scaleInstance.progress.totalItemCount}（{progressPercent}%）
                </dd>
                <div
                  aria-label="量表题目完成进度"
                  aria-valuemax={scaleInstance.progress.totalItemCount}
                  aria-valuemin={0}
                  aria-valuenow={scaleInstance.progress.answeredItemCount}
                  className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--cma-surface-muted)]"
                  role="progressbar"
                >
                  <div
                    className="h-full bg-[var(--cma-primary)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-[var(--cma-line)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>量表分组导航</CardTitle>
              <CardDescription>
                分组与题目均按服务端顺序展示；切换分组不会清除本地未保存输入。
              </CardDescription>
            </div>
            <Badge tone={unsavedItemCount > 0 ? 'warning' : 'success'}>
              未保存题目：{unsavedItemCount}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {sections.length > 0 ? (
            <ScaleExecutionGroupNavigation
              activeGroupCode={effectiveActiveGroupCode}
              onSelectGroup={setActiveGroupCode}
              sections={sections}
            />
          ) : (
            <p className="py-6 text-center text-base text-[var(--cma-muted)]">
              当前量表没有可展示的安全分组或题目。
            </p>
          )}
        </CardContent>
      </Card>

      {activeSection ? (
        <section className="grid gap-5" key={activeSection.code}>
          <header className="rounded-md border border-[var(--cma-line)] bg-[var(--cma-surface-muted)] p-5">
            <p className="text-sm font-semibold text-[var(--cma-primary)]">
              当前分组
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-[var(--cma-text-strong)]">
              {activeSection.title}
            </h2>
            {activeSection.description ? (
              <p className="mt-2 text-base leading-7 text-[var(--cma-muted)]">
                {activeSection.description}
              </p>
            ) : null}
            {activeSection.instruction ? (
              <div className="mt-4 rounded-md border border-[var(--cma-line-strong)] bg-[var(--cma-info-soft)] p-4">
                <h3 className="font-semibold text-[var(--cma-info)]">
                  分组指导语
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-lg leading-8 text-[var(--cma-text-strong)]">
                  {activeSection.instruction}
                </p>
              </div>
            ) : null}
            {activeSection.cognitiveDomainCodes.length > 0 ? (
              <p className="mt-3 text-sm leading-6 text-[var(--cma-muted)]">
                认知域编码：{activeSection.cognitiveDomainCodes.join('、')}
              </p>
            ) : null}
          </header>

          {activeSection.itemResponses.length > 0 ? (
            activeSection.itemResponses.map((item) => {
              const draft = drafts[item.id];

              if (!draft) {
                return null;
              }

              return (
                <ItemResponseEditor
                  draft={draft}
                  feedback={feedbacks[item.id] ?? null}
                  isDirty={itemDraftHasChanges(item, draft)}
                  isSaving={savingItemIds.has(item.id)}
                  item={item}
                  key={item.id}
                  onChange={(nextDraft) =>
                    handleDraftChange(item.id, nextDraft)
                  }
                  onSave={(markAsAnswered) =>
                    handleSaveItem(item.id, markAsAnswered)
                  }
                  pageReadOnlyReason={readOnlyReason}
                />
              );
            })
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>该分组暂无题目</CardTitle>
                <CardDescription>
                  服务端当前未返回属于该分组的安全题目。
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </section>
      ) : null}
    </div>
  );
}
