// Node-only contract spec: production pure functions and bounded source checks only.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { ClinicalReportApiError } from '@/src/features/assessments/api/clinical-report-api';
import {
  refreshClinicalReportLatestAtMostOnce,
  shouldProhibitClinicalReportWrite,
  shouldRefreshClinicalReportAfterError,
} from '@/src/features/assessments/hooks/clinical-report-workflow/clinical-report-workflow-recovery';
import {
  buildCreateClinicalReportCorrectionRequest,
  canCurrentRolesWriteReplacement,
  clinicalReportCorrectionDraftMatchesReport,
  clinicalReportCorrectionLimits,
  continueClinicalReportCorrectionWithLatest,
  createClinicalReportCorrectionDraft,
  createClinicalReportCorrectionResumeDraft,
  getClinicalReportCorrectionConsistencyWarning,
  getClinicalReportCorrectionResumeEligibilityWarning,
  getClinicalReportCorrectionStartEligibilityWarning,
  isClinicalReportCorrectionDirty,
  isSafeCorrectionReplacement,
  validateClinicalReportCorrectionDraft,
} from '@/src/features/assessments/lib/clinical-report-correction-draft';
import { getClinicalReportLifecycleTarget } from '@/src/features/assessments/lib/clinical-report-lifecycle-target';
import type {
  ClinicalReport,
  ClinicalReportCorrectionSummary,
  ClinicalReportReplacementLineage,
  ClinicalReportSourceFreezeResourceCounts,
  ClinicalReportSourceFreezeSummary,
} from '@/src/features/assessments/types/clinical-report';

const sourceReportId = '507f1f77bcf86cd799439051';
const sourceV2ReportId = '507f1f77bcf86cd799439052';
const replacementReportId = '507f1f77bcf86cd799439053';
const latestReportId = '507f1f77bcf86cd799439054';
const operatorId = '507f1f77bcf86cd799439055';
const updatedAt = '2026-08-02T13:00:00.000Z';
const latestUpdatedAt = '2026-08-02T14:00:00.000Z';
const lockedAt = '2026-08-02T11:00:00.000Z';
const freezeCompletedAt = '2026-08-02T11:30:00.000Z';
const archivedAt = '2026-08-02T12:00:00.000Z';
const correctionStartedAt = '2026-08-02T13:10:00.000Z';
const correctionCompletedAt = '2026-08-02T13:20:00.000Z';
const confirmationId = '11111111-1111-4111-8111-111111111111';
const lockId = '22222222-2222-4222-8222-222222222222';
const freezeId = '33333333-3333-4333-8333-333333333333';
const archiveId = '44444444-4444-4444-8444-444444444444';
const correctionId = '55555555-5555-4555-8555-555555555555';
const persistedReason = 'B15 persisted correction reason';
const persistedSummary = 'B15 persisted change summary';
const zeroCounts: ClinicalReportSourceFreezeResourceCounts = {
  scaleInstanceCount: 0,
  itemResponseCount: 0,
  scoreResultCount: 0,
  cognitiveDomainResultCount: 0,
  mediaEvidenceCount: 0,
  totalSourceCount: 0,
};
const completedCounts: ClinicalReportSourceFreezeResourceCounts = {
  scaleInstanceCount: 1,
  itemResponseCount: 2,
  scoreResultCount: 1,
  cognitiveDomainResultCount: 1,
  mediaEvidenceCount: 1,
  totalSourceCount: 6,
};

function completedSourceFreeze(
  overrides: Partial<ClinicalReportSourceFreezeSummary> = {},
): ClinicalReportSourceFreezeSummary {
  return {
    freezeId,
    state: 'completed',
    startedAt: '2026-08-02T11:10:00.000Z',
    sourceLockedAt: '2026-08-02T11:10:00.000Z',
    startedBy: {
      operatorId,
      operatorName: 'B15 Doctor',
      operatorRole: 'doctor',
    },
    freezeNote: 'B15 de-identified source-freeze note',
    expectedCounts: completedCounts,
    completedCounts,
    newlyFrozenCounts: completedCounts,
    previouslyFrozenCounts: zeroCounts,
    completedAt: freezeCompletedAt,
    completedBy: {
      operatorId,
      operatorName: 'B15 Doctor',
      operatorRole: 'doctor',
    },
    ...overrides,
  };
}

function inProgressSourceFreeze(): ClinicalReportSourceFreezeSummary {
  return {
    ...completedSourceFreeze(),
    state: 'in_progress',
    completedCounts: null,
    newlyFrozenCounts: null,
    completedAt: null,
    completedBy: null,
  };
}

function safeReplacementLineage(
  overrides: Partial<ClinicalReportReplacementLineage> = {},
): ClinicalReportReplacementLineage {
  return {
    correctionId: '66666666-6666-4666-8666-666666666666',
    correctionNo: 1,
    previousReportId: sourceReportId,
    previousReportCode: 'RPT-B15-V1',
    previousReportVersion: 1,
    replacementReportCode: 'RPT-B15-V2',
    replacementReportVersion: 2,
    createdAt: '2026-08-02T10:00:00.000Z',
    createdBy: {
      operatorId,
      operatorName: 'B15 Admin',
      operatorRole: 'admin',
    },
    correctionReason: 'B15 safe prior correction reason',
    changeSummary: 'B15 safe prior change summary',
    sourceArchiveId: '77777777-7777-4777-8777-777777777777',
    sourceArchivedAt: '2026-08-02T09:00:00.000Z',
    sourceFreezeId: '88888888-8888-4888-8888-888888888888',
    sourceFreezeCompletedAt: '2026-08-02T08:30:00.000Z',
    ...overrides,
  };
}

function readyArchivedCorrectionSource(
  overrides: Partial<ClinicalReport> = {},
): ClinicalReport {
  return {
    id: sourceReportId,
    reportCode: 'RPT-B15-V1',
    reportType: 'cognitive_assessment',
    status: 'archived',
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
      confirmationId,
      confirmedAt: '2026-08-02T10:30:00.000Z',
      confirmedByName: 'B15 Doctor',
      confirmedByRole: 'doctor',
      confirmationNote: 'B15 de-identified confirmation note',
    },
    lockedAt,
    lock: {
      lockId,
      lockedAt,
      lockedBy: {
        operatorId,
        operatorName: 'B15 Doctor',
        operatorRole: 'doctor',
      },
      lockNote: 'B15 de-identified lock note',
    },
    sourceFreeze: completedSourceFreeze(),
    archivedAt,
    archive: {
      archiveId,
      archivedAt,
      archivedBy: {
        operatorId,
        operatorName: 'B15 Doctor',
        operatorRole: 'doctor',
      },
      archiveNote: 'B15 de-identified archive note',
      sourceFreezeId: freezeId,
      sourceFreezeCompletedAt: freezeCompletedAt,
    },
    correction: null,
    replacementOf: null,
    voidedAt: null,
    createdAt: '2026-08-02T10:00:00.000Z',
    updatedAt,
    isFinal: true,
    ...overrides,
  };
}

function inProgressCorrectionSource(
  correctionOverrides: Partial<ClinicalReportCorrectionSummary> = {},
  reportOverrides: Partial<ClinicalReport> = {},
): ClinicalReport {
  return readyArchivedCorrectionSource({
    correction: {
      correctionId,
      correctionNo: 1,
      state: 'in_progress',
      startedAt: correctionStartedAt,
      startedBy: {
        operatorId,
        operatorName: 'B15 Doctor',
        operatorRole: 'doctor',
      },
      correctionReason: persistedReason,
      changeSummary: persistedSummary,
      previousReportCode: 'RPT-B15-V1',
      previousReportVersion: 1,
      replacementReportId: null,
      replacementReportCode: 'RPT-B15-V2',
      replacementReportVersion: 2,
      completedAt: null,
      completedBy: null,
      ...correctionOverrides,
    },
    ...reportOverrides,
  });
}

function completedCorrectionSource(
  correctionOverrides: Partial<ClinicalReportCorrectionSummary> = {},
  reportOverrides: Partial<ClinicalReport> = {},
): ClinicalReport {
  return readyArchivedCorrectionSource({
    status: 'corrected',
    correction: {
      correctionId,
      correctionNo: 1,
      state: 'completed',
      startedAt: correctionStartedAt,
      startedBy: {
        operatorId,
        operatorName: 'B15 Doctor',
        operatorRole: 'doctor',
      },
      correctionReason: persistedReason,
      changeSummary: persistedSummary,
      previousReportCode: 'RPT-B15-V1',
      previousReportVersion: 1,
      replacementReportId,
      replacementReportCode: 'RPT-B15-V2',
      replacementReportVersion: 2,
      completedAt: correctionCompletedAt,
      completedBy: {
        operatorId,
        operatorName: 'B15 Admin',
        operatorRole: 'admin',
      },
      ...correctionOverrides,
    },
    updatedAt: correctionCompletedAt,
    ...reportOverrides,
  });
}

function safeCorrectionReplacement(
  overrides: Partial<ClinicalReport> = {},
): ClinicalReport {
  return readyArchivedCorrectionSource({
    id: replacementReportId,
    reportCode: 'RPT-B15-V2',
    status: 'draft',
    reportVersion: 2,
    confirmation: null,
    lockedAt: null,
    lock: null,
    sourceFreeze: null,
    archivedAt: null,
    archive: null,
    correction: null,
    replacementOf: safeReplacementLineage(),
    isFinal: false,
    updatedAt: correctionCompletedAt,
    ...overrides,
  });
}

function sourceSection(
  source: string,
  startMarker: string,
  endMarker: string,
): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing source marker: ${startMarker}`).toBeGreaterThan(-1);
  expect(end, `missing source marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

function sourceFrom(source: string, startMarker: string): string {
  const start = source.indexOf(startMarker);
  expect(start, `missing source marker: ${startMarker}`).toBeGreaterThan(-1);
  return source.slice(start);
}

function sourceElement(
  source: string,
  tagName: string,
  marker: string,
): string {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex, `missing element marker: ${marker}`).toBeGreaterThan(-1);
  const start = source.lastIndexOf(`<${tagName}`, markerIndex);
  expect(start, `missing <${tagName}> for: ${marker}`).toBeGreaterThan(-1);
  const selfClosingEnd = source.indexOf('/>', markerIndex);
  const pairedEnd = source.indexOf(`</${tagName}>`, markerIndex);
  const candidates = [selfClosingEnd, pairedEnd].filter(
    (candidate) => candidate > markerIndex,
  );
  expect(candidates.length, `missing </${tagName}> for: ${marker}`).toBeGreaterThan(0);
  const end = Math.min(...candidates);
  const closingLength = end === selfClosingEnd ? 2 : tagName.length + 3;
  return source.slice(start, end + closingLength);
}

function readFrontendSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

test.describe('B15 correction Node-only contracts', () => {
  test('C13 preserves representative roles and V1 or V2+ source eligibility', () => {
    expect(canCurrentRolesWriteReplacement(['doctor'])).toBe(true);
    expect(canCurrentRolesWriteReplacement(['admin'])).toBe(true);
    expect(canCurrentRolesWriteReplacement(['nurse', 'doctor'])).toBe(true);
    expect(canCurrentRolesWriteReplacement(['nurse'])).toBe(false);
    expect(canCurrentRolesWriteReplacement(['research_assistant'])).toBe(false);
    expect(canCurrentRolesWriteReplacement(['system'])).toBe(false);
    expect(canCurrentRolesWriteReplacement([])).toBe(false);

    const readyV1 = readyArchivedCorrectionSource();
    expect(getClinicalReportCorrectionStartEligibilityWarning(readyV1)).toBeNull();
    expect(getClinicalReportCorrectionResumeEligibilityWarning(readyV1)).toContain(
      '没有可显式恢复',
    );
    expect(getClinicalReportLifecycleTarget(readyV1)).toEqual({
      kind: 'version_one',
      reportVersion: 1,
    });

    const readyV2 = readyArchivedCorrectionSource({
      id: sourceV2ReportId,
      reportCode: 'RPT-B15-V2',
      reportVersion: 2,
      replacementOf: safeReplacementLineage(),
    });
    expect(getClinicalReportCorrectionStartEligibilityWarning(readyV2)).toBeNull();
    expect(getClinicalReportLifecycleTarget(readyV2)).toEqual({
      kind: 'replacement',
      reportVersion: 2,
    });

    const inProgress = inProgressCorrectionSource();
    expect(getClinicalReportCorrectionStartEligibilityWarning(inProgress)).toContain(
      '只能恢复同一流程',
    );
    expect(getClinicalReportCorrectionResumeEligibilityWarning(inProgress)).toBeNull();

    const unsafeV2Lineage = safeReplacementLineage({
      previousReportId: sourceV2ReportId,
    });
    const blockedReports = [
      readyArchivedCorrectionSource({ status: 'confirmed' }),
      readyArchivedCorrectionSource({ sourceFreeze: inProgressSourceFreeze() }),
      readyArchivedCorrectionSource({
        archive: {
          ...readyV1.archive!,
          sourceFreezeId: '99999999-9999-4999-8999-999999999999',
        },
      }),
      readyArchivedCorrectionSource({ voidedAt: updatedAt }),
      readyArchivedCorrectionSource({ id: 'unsafe-report-id' }),
      readyArchivedCorrectionSource({ updatedAt: 'unsafe-updated-at' }),
      completedCorrectionSource(),
      readyArchivedCorrectionSource({
        id: sourceV2ReportId,
        reportCode: 'RPT-B15-V2',
        reportVersion: 2,
        replacementOf: unsafeV2Lineage,
      }),
    ];
    for (const blocked of blockedReports) {
      expect(getClinicalReportCorrectionStartEligibilityWarning(blocked)).not.toBeNull();
    }
  });

  test('C13 enforces correction consistency and safe replacement lineage', () => {
    const inProgressWithoutReplacement = inProgressCorrectionSource();
    const inProgressWithReplacement = inProgressCorrectionSource({
      replacementReportId,
    });
    expect(
      getClinicalReportCorrectionConsistencyWarning(inProgressWithoutReplacement),
    ).toBeNull();
    expect(
      getClinicalReportCorrectionConsistencyWarning(inProgressWithReplacement),
    ).toBeNull();

    const completed = completedCorrectionSource();
    expect(getClinicalReportCorrectionConsistencyWarning(completed)).toBeNull();
    expect(getClinicalReportCorrectionStartEligibilityWarning(completed)).not.toBeNull();
    expect(getClinicalReportCorrectionResumeEligibilityWarning(completed)).not.toBeNull();

    const replacement = safeCorrectionReplacement();
    expect(isSafeCorrectionReplacement(replacement)).toBe(true);

    const inconsistentReports = [
      inProgressCorrectionSource({ correctionId: 'unsafe-correction-id' }),
      inProgressCorrectionSource({ correctionNo: 2 }),
      completedCorrectionSource({ replacementReportId: null }),
      completedCorrectionSource({}, { status: 'archived' }),
    ];
    for (const inconsistent of inconsistentReports) {
      expect(getClinicalReportCorrectionConsistencyWarning(inconsistent)).not.toBeNull();
    }

    expect(
      isSafeCorrectionReplacement(
        safeCorrectionReplacement({
          replacementOf: safeReplacementLineage({
            previousReportId: replacementReportId,
          }),
        }),
      ),
    ).toBe(false);
    expect(
      isSafeCorrectionReplacement(
        safeCorrectionReplacement({
          replacementOf: safeReplacementLineage({
            replacementReportVersion: 3,
          }),
        }),
      ),
    ).toBe(false);
  });

  test('C13 creates faithful start and persisted resume drafts', () => {
    const ready = readyArchivedCorrectionSource();
    expect(createClinicalReportCorrectionDraft(ready)).toEqual({
      mode: 'start',
      sourceReportId,
      baseUpdatedAt: updatedAt,
      correctionId: null,
      correctionReason: '',
      changeSummary: '',
      confirmed: false,
      stale: false,
      usesPersistedContent: false,
    });
    expect(
      createClinicalReportCorrectionDraft(
        readyArchivedCorrectionSource({ status: 'confirmed' }),
      ),
    ).toBeNull();

    const preservedReason = '  B15 server-preserved reason  ';
    const preservedSummary = '  B15 server-preserved summary  ';
    const resumable = inProgressCorrectionSource({
      correctionReason: preservedReason,
      changeSummary: preservedSummary,
    });
    const resume = createClinicalReportCorrectionResumeDraft(resumable);
    expect(resume).toEqual({
      mode: 'resume',
      sourceReportId,
      baseUpdatedAt: updatedAt,
      correctionId,
      correctionReason: preservedReason,
      changeSummary: preservedSummary,
      confirmed: false,
      stale: false,
      usesPersistedContent: true,
    });
    expect(resume?.correctionId).toBe(resumable.correction?.correctionId);
    expect(resume?.correctionReason).toBe(resumable.correction?.correctionReason);
    expect(resume?.changeSummary).toBe(resumable.correction?.changeSummary);

    expect(createClinicalReportCorrectionResumeDraft(completedCorrectionSource())).toBeNull();
    expect(createClinicalReportCorrectionResumeDraft(ready)).toBeNull();
    expect(
      createClinicalReportCorrectionResumeDraft(
        inProgressCorrectionSource({ correctionId: 'unsafe-correction-id' }),
      ),
    ).toBeNull();
  });

  test('C13 validates dirty and report matching semantics', () => {
    const report = readyArchivedCorrectionSource();
    const start = createClinicalReportCorrectionDraft(report);
    if (!start) throw new Error('Expected a correction start draft');

    expect(validateClinicalReportCorrectionDraft(start).valid).toBe(false);
    expect(
      validateClinicalReportCorrectionDraft({
        ...start,
        correctionReason: ' x ',
        changeSummary: 'valid summary',
        confirmed: true,
      }).valid,
    ).toBe(false);
    expect(
      validateClinicalReportCorrectionDraft({
        ...start,
        correctionReason: 'valid reason',
        changeSummary: ' x ',
        confirmed: true,
      }).valid,
    ).toBe(false);
    expect(
      validateClinicalReportCorrectionDraft({
        ...start,
        correctionReason:
          'x'.repeat(clinicalReportCorrectionLimits.correctionReason.max + 1),
        changeSummary: 'valid summary',
        confirmed: true,
      }).valid,
    ).toBe(false);
    expect(
      validateClinicalReportCorrectionDraft({
        ...start,
        correctionReason: 'valid reason',
        changeSummary:
          'x'.repeat(clinicalReportCorrectionLimits.changeSummary.max + 1),
        confirmed: true,
      }).valid,
    ).toBe(false);
    expect(
      validateClinicalReportCorrectionDraft({
        ...start,
        correctionReason: 'valid reason',
        changeSummary: 'valid summary',
        confirmed: true,
        stale: true,
      }).valid,
    ).toBe(false);
    const validStart = {
      ...start,
      correctionReason: '  valid correction reason  ',
      changeSummary: '  valid change summary  ',
      confirmed: true,
    };
    expect(validateClinicalReportCorrectionDraft(validStart).valid).toBe(true);
    expect(isClinicalReportCorrectionDirty(validStart)).toBe(true);
    expect(
      isClinicalReportCorrectionDirty({
        ...start,
        correctionReason: '  ',
        changeSummary: '\n',
      }),
    ).toBe(false);

    expect(clinicalReportCorrectionDraftMatchesReport(start, report)).toBe(true);
    expect(
      clinicalReportCorrectionDraftMatchesReport(
        start,
        readyArchivedCorrectionSource({ id: latestReportId }),
      ),
    ).toBe(false);
    expect(
      clinicalReportCorrectionDraftMatchesReport(
        start,
        readyArchivedCorrectionSource({ updatedAt: latestUpdatedAt }),
      ),
    ).toBe(false);
    expect(
      clinicalReportCorrectionDraftMatchesReport(start, inProgressCorrectionSource()),
    ).toBe(false);

    const inProgress = inProgressCorrectionSource();
    const resume = createClinicalReportCorrectionResumeDraft(inProgress);
    if (!resume) throw new Error('Expected a correction resume draft');
    expect(
      validateClinicalReportCorrectionDraft({ ...resume, confirmed: true }).valid,
    ).toBe(true);
    expect(isClinicalReportCorrectionDirty(resume)).toBe(false);
    expect(resume.usesPersistedContent).toBe(true);
    expect(clinicalReportCorrectionDraftMatchesReport(resume, inProgress)).toBe(true);
    expect(
      clinicalReportCorrectionDraftMatchesReport(
        { ...resume, correctionId: '99999999-9999-4999-8999-999999999999' },
        inProgress,
      ),
    ).toBe(false);
    expect(
      clinicalReportCorrectionDraftMatchesReport(
        resume,
        completedCorrectionSource(),
      ),
    ).toBe(false);
  });

  test('C13 keeps exact correction request and API client whitelist', () => {
    const start = createClinicalReportCorrectionDraft(readyArchivedCorrectionSource());
    if (!start) throw new Error('Expected a correction start draft');
    const startRequest = buildCreateClinicalReportCorrectionRequest({
      ...start,
      correctionReason: '  B15 de-identified reason  ',
      changeSummary: '  B15 de-identified summary  ',
      confirmed: true,
    });
    const resume = createClinicalReportCorrectionResumeDraft(
      inProgressCorrectionSource(),
    );
    if (!resume) throw new Error('Expected a correction resume draft');
    const resumeRequest = buildCreateClinicalReportCorrectionRequest({
      ...resume,
      confirmed: true,
    });

    for (const request of [startRequest, resumeRequest]) {
      expect(Object.keys(request)).toEqual([
        'confirm',
        'correctionReason',
        'changeSummary',
        'expectedUpdatedAt',
      ]);
      expect(request.confirm).toBe(true);
      expect(request.expectedUpdatedAt).toBe(updatedAt);
      for (const forbiddenKey of [
        'correctionId',
        'correctionNo',
        'sourceReportId',
        'replacementReportId',
        'reportVersion',
        'reportCode',
        'status',
        'actor',
        'startedAt',
        'completedAt',
        'metadata',
        'resume',
        'rollback',
        'branch',
        'force',
        'archive',
        'void',
        'createPdf',
      ]) {
        expect(request).not.toHaveProperty(forbiddenKey);
      }
    }
    expect(startRequest.correctionReason).toBe('B15 de-identified reason');
    expect(startRequest.changeSummary).toBe('B15 de-identified summary');
    expect(resumeRequest.correctionReason).toBe(persistedReason);
    expect(resumeRequest.changeSummary).toBe(persistedSummary);

    const apiSource = readFrontendSource(
      'src/features/assessments/api/clinical-report-api.ts',
    );
    const correctionApiSource = sourceFrom(
      apiSource,
      'export async function createClinicalReportCorrection(',
    );
    const requestBodySource = sourceSection(
      correctionApiSource,
      'const requestBody: CreateClinicalReportCorrectionRequest = {',
      'const response = await clinicalReportFetch',
    );
    expect(requestBodySource).toContain('confirm: true');
    expect(requestBodySource).toContain(
      'correctionReason: input.correctionReason.trim()',
    );
    expect(requestBodySource).toContain(
      'changeSummary: input.changeSummary.trim()',
    );
    expect(requestBodySource).toContain(
      'expectedUpdatedAt: input.expectedUpdatedAt',
    );
    expect(requestBodySource).not.toContain('correctionId');
    expect(correctionApiSource).toContain('/corrections`');
    expect(correctionApiSource).toContain("method: 'POST'");
  });

  test('C13 continues a stale start only with a safe latest source', () => {
    const start = createClinicalReportCorrectionDraft(readyArchivedCorrectionSource());
    if (!start) throw new Error('Expected a correction start draft');
    const staleStart = {
      ...start,
      correctionReason: '  B15 local reason remains byte-for-byte  ',
      changeSummary: '  B15 local summary remains byte-for-byte  ',
      confirmed: true,
      stale: true,
    };
    const latest = readyArchivedCorrectionSource({
      id: latestReportId,
      updatedAt: latestUpdatedAt,
    });
    const continued = continueClinicalReportCorrectionWithLatest(
      staleStart,
      latest,
    );
    expect(continued).toMatchObject({
      mode: 'start',
      sourceReportId: latestReportId,
      baseUpdatedAt: latestUpdatedAt,
      correctionId: null,
      correctionReason: staleStart.correctionReason,
      changeSummary: staleStart.changeSummary,
      confirmed: false,
      stale: false,
      usesPersistedContent: false,
    });

    const unsafeV2 = readyArchivedCorrectionSource({
      id: sourceV2ReportId,
      reportCode: 'RPT-B15-V2',
      reportVersion: 2,
      replacementOf: safeReplacementLineage({
        previousReportId: sourceV2ReportId,
      }),
    });
    const unsafeLatestReports = [
      readyArchivedCorrectionSource({ status: 'corrected' }),
      completedCorrectionSource(),
      inProgressCorrectionSource(),
      readyArchivedCorrectionSource({ voidedAt: updatedAt }),
      readyArchivedCorrectionSource({ sourceFreeze: inProgressSourceFreeze() }),
      readyArchivedCorrectionSource({
        archive: {
          ...latest.archive!,
          sourceFreezeId: '99999999-9999-4999-8999-999999999999',
        },
      }),
      unsafeV2,
    ];
    for (const unsafeLatest of unsafeLatestReports) {
      expect(
        continueClinicalReportCorrectionWithLatest(staleStart, unsafeLatest),
      ).toBeNull();
    }

    const resume = createClinicalReportCorrectionResumeDraft(
      inProgressCorrectionSource(),
    );
    if (!resume) throw new Error('Expected a correction resume draft');
    expect(
      continueClinicalReportCorrectionWithLatest(
        { ...resume, stale: true },
        latest,
      ),
    ).toBeNull();
  });

  test('C14 limits controlled latest refresh and correction write prohibition', async () => {
    for (const kind of [
      'clinical_report_not_correctable',
      'clinical_report_correction_not_latest',
      'clinical_report_correction_conflict',
      'clinical_report_correction_incomplete',
      'clinical_report_correction_failed',
    ] as const) {
      const error = new ClinicalReportApiError(kind);
      expect(shouldRefreshClinicalReportAfterError(error)).toBe(true);
      let refreshCount = 0;
      await refreshClinicalReportLatestAtMostOnce(error, async () => {
        refreshCount += 1;
        return readyArchivedCorrectionSource();
      });
      expect(refreshCount).toBe(1);
      expect(shouldProhibitClinicalReportWrite('correction', error)).toBe(false);
    }

    for (const kind of ['service_unavailable', 'unknown'] as const) {
      const error = new ClinicalReportApiError(kind);
      expect(shouldRefreshClinicalReportAfterError(error)).toBe(false);
      let refreshCount = 0;
      await refreshClinicalReportLatestAtMostOnce(error, async () => {
        refreshCount += 1;
        return readyArchivedCorrectionSource();
      });
      expect(refreshCount).toBe(0);
    }

    for (const kind of [
      'clinical_report_correction_audit_unavailable',
      'clinical_report_correction_replacement_conflict',
      'clinical_report_metadata_unsupported',
      'clinical_report_replacement_lineage_invalid',
    ] as const) {
      expect(
        shouldProhibitClinicalReportWrite(
          'correction',
          new ClinicalReportApiError(kind),
        ),
      ).toBe(true);
    }
    for (const kind of [
      'clinical_report_not_correctable',
      'clinical_report_correction_conflict',
      'clinical_report_correction_failed',
    ] as const) {
      expect(
        shouldProhibitClinicalReportWrite(
          'correction',
          new ClinicalReportApiError(kind),
        ),
      ).toBe(false);
    }
  });

  test('C14 keeps one correction POST and applies server replacement identity', () => {
    const actionSource = readFrontendSource(
      'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportCorrectionAction.ts',
    );
    expect(
      actionSource.match(/\bcreateClinicalReportCorrection\s*\(/g),
    ).toHaveLength(1);
    expect(actionSource.match(/\bcoordinator\.execute\s*\(/g)).toHaveLength(1);

    const confirmSource = sourceSection(
      actionSource,
      'const confirmCorrection = useCallback',
      'return {',
    );
    const requestSource = sourceSection(
      confirmSource,
      'request: () =>',
      'onSuccess: (response) => {',
    );
    expect(requestSource).toContain('createClinicalReportCorrection(');
    expect(requestSource).toContain('patientId');
    expect(requestSource).toContain('visitId');
    expect(requestSource).toContain('correctionDraft.sourceReportId');
    expect(requestSource).toContain(
      'buildCreateClinicalReportCorrectionRequest(correctionDraft)',
    );

    const successSource = sourceSection(
      confirmSource,
      'onSuccess: (response) => {',
      'onError: async (error) => {',
    );
    expect(successSource).toContain('const receipt = response.correctionReceipt');
    expect(successSource).toContain(
      'coordinator.applyReportUpdate(response.replacementReport',
    );
    expect(successSource).toContain("kind: 'correction_replacement'");
    expect(successSource).toContain('sourceReportId: receipt.sourceReportId');
    expect(successSource).toContain(
      'replacementReportId: receipt.replacementReportId',
    );
    expect(successSource).not.toContain('correctionDraft.sourceReportId');
    expect(successSource).not.toMatch(/reportVersion\s*[+\-]/);
    expect(successSource).toContain('coordinator.completeCorrection(');
    expect(successSource).toContain('receipt,');
    expect(successSource).toContain('response.sourceReport');
    expect(successSource).toContain('receipt.alreadyCreated');
    expect(successSource).toContain('receipt.resumedExisting');
    expect(successSource).toContain('此前已经创建');
    expect(successSource).toContain('已恢复并完成');
    expect(successSource).toContain('已进入替代报告草稿');
    expect(successSource).not.toContain('coordinator.refreshLatest');
  });

  test('C14 separates error recovery manual latest and prevents replay or polling', () => {
    const actionSource = readFrontendSource(
      'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportCorrectionAction.ts',
    );
    const confirmSource = sourceSection(
      actionSource,
      'const confirmCorrection = useCallback',
      'return {',
    );
    const errorSource = sourceSection(
      confirmSource,
      'onError: async (error) => {',
      'await coordinator.refreshAfterError(error);',
    );
    expect(errorSource.match(/\bsetCorrectionError\s*\(error\)/g)).toHaveLength(1);
    expect(errorSource).toContain('coordinator.setLiveMessage(null)');
    expect(errorSource).toContain(
      "shouldProhibitClinicalReportWrite('correction', error)",
    );
    expect(errorSource).toContain('shouldRefreshClinicalReportAfterError(error)');
    expect(errorSource).toContain("error.kind === 'service_unavailable'");
    expect(errorSource).toContain("error.kind === 'unknown'");
    expect(errorSource).toContain('confirmed: false, stale: true');
    expect(errorSource).toMatch(/else\s*\{[\s\S]*confirmed: false/);
    expect(errorSource).not.toContain('createClinicalReportCorrection(');
    expect(errorSource).not.toContain('coordinator.refreshLatest');
    expect(errorSource).not.toContain('confirmCorrection(');
    expect(errorSource).not.toContain('reloadLatestAfterCorrectionUncertainty');
    expect(
      confirmSource.match(/\bcoordinator\.refreshAfterError\s*\(error\)/g),
    ).toHaveLength(1);

    const manualSource = sourceSection(
      actionSource,
      'const reloadLatestAfterCorrectionUncertainty = useCallback',
      'const confirmCorrection = useCallback',
    );
    expect(manualSource).toContain('confirmed: false, stale: true');
    expect(manualSource).toContain('await coordinator.refreshLatest()');
    expect(
      manualSource.indexOf('confirmed: false, stale: true'),
    ).toBeLessThan(manualSource.indexOf('await coordinator.refreshLatest()'));
    expect(manualSource).not.toContain('refreshAfterError');
    expect(manualSource).not.toContain('createClinicalReportCorrection(');
    expect(manualSource).not.toContain('confirmCorrection(');

    expect(confirmSource).not.toMatch(
      /\bwhile\s*\(|\bfor\s*\(|setInterval\s*\(|poll(?:ing)?\s*\(/i,
    );
    expect(confirmSource).not.toMatch(/\bconfirmCorrection\s*\(/);
    expect(confirmSource).not.toContain('reloadLatestAfterCorrectionUncertainty(');
    expect(
      actionSource.match(/\bcreateClinicalReportCorrection\s*\(/g),
    ).toHaveLength(1);
  });

  test('C14 keeps input updates and baseline staleness bounded', () => {
    const actionSource = readFrontendSource(
      'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportCorrectionAction.ts',
    );
    const reasonSource = sourceSection(
      actionSource,
      'const updateCorrectionReason = useCallback',
      'const updateCorrectionChangeSummary = useCallback',
    );
    expect(reasonSource).toContain("current.mode === 'start'");
    expect(reasonSource).toContain('!current.usesPersistedContent');
    expect(reasonSource).toContain('correctionReason: value, confirmed: false');

    const summarySource = sourceSection(
      actionSource,
      'const updateCorrectionChangeSummary = useCallback',
      'const setCorrectionConfirmed = useCallback',
    );
    expect(summarySource).toContain("current.mode === 'start'");
    expect(summarySource).toContain('!current.usesPersistedContent');
    expect(summarySource).toContain('changeSummary: value, confirmed: false');

    const staleSource = sourceSection(
      actionSource,
      'useEffect(() => {',
      'const openCorrection = useCallback',
    );
    expect(staleSource).toContain(
      '!clinicalReportCorrectionDraftMatchesReport(correctionDraft, report)',
    );
    expect(staleSource).toContain('confirmed: false, stale: true');
  });

  test('C08 keeps persisted Panel fields read-only and correctionId internal', () => {
    const panelSource = readFrontendSource(
      'src/features/assessments/components/ClinicalReportCorrectionPanel.tsx',
    );
    const persistedSource = sourceSection(
      panelSource,
      'const persisted = draft.mode',
      'const latestIsCurrentCorrectionReplacement',
    );
    expect(persistedSource).toContain("draft.mode === 'resume'");

    const panelRenderSource = sourceFrom(
      panelSource,
      'aria-labelledby="clinical-report-correction-heading"',
    );
    expect(panelRenderSource).toContain('继续同一版本化更正流程');
    expect(panelRenderSource).toContain('服务端已保存的同一版本化更正流程');
    expect(panelRenderSource).toContain('原始原因与摘要只读');
    expect(panelRenderSource).toContain(
      '内部关联标识由系统保存，不在页面展示',
    );

    const reasonElement = sourceElement(
      panelRenderSource,
      'textarea',
      'id="clinical-report-correction-reason"',
    );
    expect(reasonElement).toContain('disabled={isWriting || persisted}');
    expect(reasonElement).toContain('readOnly={persisted}');
    expect(reasonElement).toContain('value={draft.correctionReason}');

    const summaryElement = sourceElement(
      panelRenderSource,
      'textarea',
      'id="clinical-report-correction-summary"',
    );
    expect(summaryElement).toContain('disabled={isWriting || persisted}');
    expect(summaryElement).toContain('readOnly={persisted}');
    expect(summaryElement).toContain('value={draft.changeSummary}');

    const confirmationElement = sourceElement(
      panelRenderSource,
      'input',
      'id="clinical-report-correction-confirmed"',
    );
    expect(confirmationElement).toContain('checked={draft.confirmed}');

    const submitElement = sourceElement(
      panelRenderSource,
      'Button',
      'workflow.confirmCorrection()',
    );
    expect(submitElement).toContain('确认继续同一更正流程');
    expect(panelRenderSource).not.toContain('correctionId');
  });

  test('C08 exposes business traceability without rendering correctionId', () => {
    const summarySource = readFrontendSource(
      'src/features/assessments/components/ClinicalReportCorrectionSummary.tsx',
    );
    const summaryRenderSource = sourceFrom(
      summarySource,
      'id="clinical-report-correction-summary-heading"',
    );
    for (const label of [
      '更正序号',
      '报告 / 版本',
      '来源报告 / 版本',
      '替代版本',
      '开始',
      '发起人',
      '完成',
      '完成人',
      '更正原因',
      '计划变更摘要',
    ]) {
      expect(summaryRenderSource).toContain(label);
    }
    for (const field of [
      'correction.correctionNo',
      'source.reportCode',
      'source.reportVersion',
      'correction.previousReportCode',
      'correction.previousReportVersion',
      'correction.replacementReportCode',
      'correction.replacementReportVersion',
      'correction.startedAt',
      'correction.startedBy',
      'correction.completedAt',
      'correction.completedBy',
      'correction.correctionReason',
      'correction.changeSummary',
    ]) {
      expect(summaryRenderSource).toContain(field);
    }
    expect(summaryRenderSource).toContain('receipt.correctionNo');
    expect(summaryRenderSource).toContain('receipt.alreadyCreated');
    expect(summaryRenderSource).toContain('receipt.resumedExisting');
    expect(summaryRenderSource).toContain('替代报告此前已经创建');
    expect(summaryRenderSource).toContain('既有更正流程已恢复并完成');
    expect(summaryRenderSource).toContain('下一线性版本已经创建');
    expect(summaryRenderSource).toContain(
      '内部关联标识由系统保存，不在页面展示',
    );
    expect(summaryRenderSource).not.toContain('correctionId');

    const workflowSummarySource = readFrontendSource(
      'src/features/assessments/components/ClinicalReportWorkflowSummary.tsx',
    );
    const correctionReceiptSource = sourceFrom(
      workflowSummarySource,
      '{workflow.correctionReceipt ? (',
    );
    expect(correctionReceiptSource).toContain(
      'workflow.correctionReceipt.alreadyCreated',
    );
    expect(correctionReceiptSource).toContain(
      'workflow.correctionReceipt.resumedExisting',
    );
    expect(correctionReceiptSource).toContain(
      'workflow.correctionReceipt.previousReportVersion',
    );
    expect(correctionReceiptSource).toContain(
      'workflow.correctionReceipt.replacementReportVersion',
    );
    expect(correctionReceiptSource).not.toContain('correctionId');
  });
});
