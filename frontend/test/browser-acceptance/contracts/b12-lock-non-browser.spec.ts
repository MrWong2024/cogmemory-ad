// Node-only contract spec: pure functions and bounded source checks only.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { ClinicalReportApiError } from '@/src/features/assessments/api/clinical-report-api';
import {
  canClinicalReportRoleLock,
  canContinueClinicalReportLockDraftWithLatest,
  getClinicalReportLockEligibilityBlockReason,
  isClinicalReportLockEligible,
} from '@/src/features/assessments/hooks/clinical-report-workflow/useClinicalReportLockAction';
import {
  refreshClinicalReportLatestAtMostOnce,
  shouldProhibitClinicalReportWrite,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow-recovery';
import {
  clinicalReportLockBoundaryStatements,
  clinicalReportQualityStatusLabels,
  getClinicalReportApiErrorMessage,
  getClinicalReportLifecycleLabel,
  getClinicalReportLockApiErrorMessage,
  getClinicalReportLockConsistencyWarning,
} from '@/src/features/assessments/lib/clinical-report-display';
import {
  continueClinicalReportLockDraftWithLatest,
  createClinicalReportLockDraft,
  markClinicalReportLockDraftStale,
} from '@/src/features/assessments/lib/clinical-report-workflow-draft';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';

const reportId = '507f1f77bcf86cd799439011';
const otherReportId = '507f1f77bcf86cd799439012';
const updatedAt = '2026-07-31T08:00:00.000Z';

function eligibleReport(
  overrides: Partial<ClinicalReport> = {},
): ClinicalReport {
  return {
    id: reportId,
    reportCode: 'RPT-B12-V1',
    reportType: 'cognitive_assessment',
    status: 'confirmed',
    reportVersion: 1,
    source: 'mixed',
    qualityStatus: 'passed',
    patientSnapshot: null,
    visitSnapshot: null,
    scaleTraces: [],
    scoreSnapshots: [],
    domainSnapshots: [],
    evidenceSnapshots: [],
    narrative: null,
    generation: null,
    editorial: null,
    submission: null,
    confirmation: {
      confirmationId: 'b12-confirmation',
      confirmedAt: '2026-07-31T07:00:00.000Z',
      confirmedByName: 'B12 Doctor',
      confirmedByRole: 'doctor',
    },
    lockedAt: null,
    lock: null,
    sourceFreeze: null,
    archivedAt: null,
    archive: null,
    correction: null,
    replacementOf: null,
    voidedAt: null,
    createdAt: '2026-07-31T06:00:00.000Z',
    updatedAt,
    isFinal: true,
    ...overrides,
  };
}

function lockedReport(): ClinicalReport {
  const lockedAt = '2026-07-31T09:00:00.000Z';
  return eligibleReport({
    lockedAt,
    lock: {
      lockId: 'b12-lock',
      lockedAt,
      lockedBy: {
        operatorId: reportId,
        operatorName: 'B12 Doctor',
        operatorRole: 'doctor',
      },
      lockNote: 'B12 retained note',
    },
  });
}

function replacementReport(): ClinicalReport {
  return eligibleReport({
    reportCode: 'RPT-B12-V2',
    reportVersion: 2,
    replacementOf: {
      correctionId: '0f35b65d-94f2-4bd1-8b51-55ae6e31c307',
      correctionNo: 1,
      previousReportId: otherReportId,
      previousReportCode: 'RPT-B12-V1',
      previousReportVersion: 1,
      replacementReportCode: 'RPT-B12-V2',
      replacementReportVersion: 2,
      createdAt: '2026-07-31T06:30:00.000Z',
      createdBy: {
        operatorId: reportId,
        operatorName: 'B12 Admin',
        operatorRole: 'admin',
      },
      correctionReason: 'B12 safe correction reason',
      changeSummary: 'B12 safe change summary',
      sourceArchiveId: '376b474a-1329-48e3-ae4d-a17eb87027bb',
      sourceArchivedAt: '2026-07-31T06:10:00.000Z',
      sourceFreezeId: 'c26982a8-0600-444c-b59a-b71d490f643a',
      sourceFreezeCompletedAt: '2026-07-31T06:20:00.000Z',
    },
  });
}

function exportedObjectType(source: string, name: string): string {
  const marker = `export type ${name} = {`;
  const start = source.indexOf(marker);
  const end = source.indexOf('\n};', start);
  if (start < 0 || end < 0) throw new Error(`Missing exported type ${name}`);
  return source.slice(start, end + 3);
}

test.describe('B12 lock Node-only contracts', () => {
  test('B12-S01/S02 preserves the real role and first-lock eligibility matrices', () => {
    expect(canClinicalReportRoleLock(['doctor'])).toBe(true);
    expect(canClinicalReportRoleLock(['admin'])).toBe(true);
    expect(canClinicalReportRoleLock(['nurse'])).toBe(false);
    expect(canClinicalReportRoleLock(['research_assistant'])).toBe(false);
    expect(canClinicalReportRoleLock(['system'])).toBe(false);

    for (const visitStatus of ['draft', 'in_progress', 'completed'] as const) {
      expect(isClinicalReportLockEligible(eligibleReport(), visitStatus)).toBe(
        true,
      );
    }
    expect(
      isClinicalReportLockEligible(
        eligibleReport({ status: 'draft', isFinal: false }),
        'draft',
      ),
    ).toBe(false);
    expect(
      isClinicalReportLockEligible(eligibleReport({ source: 'manual' }), 'draft'),
    ).toBe(false);
    expect(
      isClinicalReportLockEligible(
        eligibleReport({ qualityStatus: 'needs_review' }),
        'draft',
      ),
    ).toBe(false);
    expect(
      isClinicalReportLockEligible(eligibleReport({ isFinal: false }), 'draft'),
    ).toBe(false);
    expect(
      isClinicalReportLockEligible(eligibleReport({ confirmation: null }), 'draft'),
    ).toBe(false);
    expect(
      isClinicalReportLockEligible(
        eligibleReport({
          confirmation: {
            confirmationId: 'b12-incomplete',
            confirmedAt: null,
            confirmedByRole: 'unknown',
          },
        }),
        'draft',
      ),
    ).toBe(false);
    expect(isClinicalReportLockEligible(lockedReport(), 'draft')).toBe(false);
    expect(
      isClinicalReportLockEligible(
        eligibleReport({
          lock: {
            lockId: 'inconsistent',
            lockedAt: updatedAt,
            lockedBy: null,
          },
        }),
        'draft',
      ),
    ).toBe(false);
    expect(
      isClinicalReportLockEligible(
        eligibleReport({
          status: 'archived',
          archivedAt: updatedAt,
          archive: {
            archiveId: 'b12-archive',
            archivedAt: updatedAt,
            archivedBy: {
              operatorId: reportId,
              operatorRole: 'admin',
            },
            sourceFreezeId: null,
            sourceFreezeCompletedAt: null,
          },
        }),
        'draft',
      ),
    ).toBe(false);
    expect(
      isClinicalReportLockEligible(
        eligibleReport({ status: 'voided', voidedAt: updatedAt, isFinal: false }),
        'draft',
      ),
    ).toBe(false);
    expect(isClinicalReportLockEligible(eligibleReport(), 'locked')).toBe(false);
    expect(isClinicalReportLockEligible(eligibleReport(), 'voided')).toBe(false);
    expect(isClinicalReportLockEligible(replacementReport(), 'locked')).toBe(
      true,
    );
  });

  test('B12-S10 retains the stale note, clears confirmation, and rejects locked latest', () => {
    const draft = createClinicalReportLockDraft(eligibleReport());
    expect(draft).not.toBeNull();
    if (!draft) throw new Error('Expected a lock draft');
    const stale = markClinicalReportLockDraftStale({
      ...draft,
      lockNote: '  B12 local note remains byte-for-byte  ',
      confirmed: true,
    });

    expect(stale.lockNote).toBe('  B12 local note remains byte-for-byte  ');
    expect(stale.confirmed).toBe(false);
    expect(stale.stale).toBe(true);
    expect(
      canContinueClinicalReportLockDraftWithLatest(
        stale,
        lockedReport(),
        'completed',
        true,
        false,
        false,
      ),
    ).toBe(false);
    expect(
      continueClinicalReportLockDraftWithLatest(stale, lockedReport()),
    ).toBeNull();
    expect(createClinicalReportLockDraft(lockedReport())).toBeNull();
    expect(
      getClinicalReportLockEligibilityBlockReason(lockedReport(), 'completed'),
    ).toBe('当前报告已经锁定，不能重复开放锁定入口。');
  });

  test('B12-S10 has one production lock invocation and at-most-once latest recovery', async () => {
    const actionSource = readFileSync(
      resolve(
        process.cwd(),
        'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportLockAction.ts',
      ),
      'utf8',
    );
    expect(actionSource.match(/\blockClinicalReport\s*\(/g)).toHaveLength(1);
    expect(actionSource.match(/canClinicalReportRoleLock\s*\(/g)?.length).toBe(
      2,
    );
    expect(
      actionSource.match(/canContinueClinicalReportLockDraftWithLatest\s*\(/g)
        ?.length,
    ).toBe(2);
    expect(actionSource.match(/markClinicalReportLockDraftStale\s*\(/g)?.length).toBe(
      2,
    );

    let refreshCount = 0;
    await refreshClinicalReportLatestAtMostOnce(
      new ClinicalReportApiError('clinical_report_lock_conflict'),
      async () => {
        refreshCount += 1;
        return lockedReport();
      },
    );
    expect(refreshCount).toBe(1);
  });

  test('B12-S11 uses safe stable degradation and prohibits unsafe writes', () => {
    const auditMessage = getClinicalReportApiErrorMessage(
      'clinical_report_lock_audit_unavailable',
    );
    const unsupportedMessage = getClinicalReportLockApiErrorMessage(
      'clinical_report_metadata_unsupported',
    );
    expect(auditMessage).toBe(
      '报告锁定审计信息不完整，不能安全推断或重复锁定。',
    );
    expect(unsupportedMessage).toBe(
      '报告内部审计结构异常，当前不能继续锁定，请联系管理员。',
    );
    for (const message of [auditMessage, unsupportedMessage]) {
      expect(message).not.toContain('operatorId');
      expect(message).not.toContain('lockedBy');
      expect(message).not.toContain('details');
      expect(message).not.toContain('内部键');
    }
    expect(
      shouldProhibitClinicalReportWrite(
        'lock',
        new ClinicalReportApiError('clinical_report_lock_audit_unavailable'),
      ),
    ).toBe(true);
    expect(
      shouldProhibitClinicalReportWrite(
        'lock',
        new ClinicalReportApiError('clinical_report_metadata_unsupported'),
      ),
    ).toBe(true);

    const incompleteLock = eligibleReport({
      lockedAt: updatedAt,
      lock: null,
    });
    expect(getClinicalReportLockConsistencyWarning(incompleteLock)).toBe(
      '报告已锁定，但当前安全响应未提供完整锁定审计摘要；系统不会猜测锁定人或说明。',
    );
  });

  test('B12-S11 public report and lock types expose no raw audit structure', () => {
    const typeSource = readFileSync(
      resolve(process.cwd(), 'src/features/assessments/types/clinical-report.ts'),
      'utf8',
    );
    expect(exportedObjectType(typeSource, 'ClinicalReport')).not.toContain(
      'metadata',
    );
    expect(
      exportedObjectType(typeSource, 'ClinicalReportLockSummary'),
    ).not.toContain('metadata');
  });

  test('B12-S14 keeps confirmed and archive terminology distinct and read-only', () => {
    const report = lockedReport();
    expect(report.status).toBe('confirmed');
    expect(getClinicalReportLifecycleLabel(report)).toBe('已确认并锁定');
    expect(report.lockedAt).not.toBeNull();
    expect(report.archivedAt).toBeNull();
    expect(clinicalReportLockBoundaryStatements).toContain(
      '锁定只作用于当前 ClinicalReport，不会锁定患者、访视、量表实例、评分、认知域或媒体。',
    );
    expect(clinicalReportLockBoundaryStatements).toContain(
      '锁定不等于归档，不生成签名，也不生成 PDF 或下载文件。',
    );

    for (const relativePath of [
      'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportEditAction.ts',
      'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportSubmissionAction.ts',
      'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportConfirmationAction.ts',
    ]) {
      expect(
        readFileSync(resolve(process.cwd(), relativePath), 'utf8'),
      ).toContain('report.lockedAt === null');
    }
  });

  test('B12-S16 keeps quality and lock copy explicitly non-diagnostic', () => {
    expect(clinicalReportQualityStatusLabels.passed).toBe(
      '报告确认流程质量标记已通过',
    );
    const statement =
      '锁定过程不调用 AI；qualityStatus=passed 不表示患者正常，也不形成新的诊断结论。';
    expect(clinicalReportLockBoundaryStatements).toContain(statement);
    expect(statement).toContain('不表示患者正常');
    expect(statement).toContain('不形成新的诊断结论');
    for (const unsafeClaim of [
      '患者正常。',
      '患者无认知问题',
      '患者无异常',
      '患者无疾病',
      '建议治疗',
    ]) {
      expect(clinicalReportLockBoundaryStatements.join('\n')).not.toContain(
        unsafeClaim,
      );
    }
  });
});
