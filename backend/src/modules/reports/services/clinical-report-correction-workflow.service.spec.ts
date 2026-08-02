import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { PatientsService } from '../../patients/services/patients.service';
import type { ClinicalReportSummary } from './reports.service';
import { ClinicalReportCorrectionWorkflowService } from './clinical-report-correction-workflow.service';
import { ClinicalReportPublicMapper } from './clinical-report-public.mapper';
import { ReportsService } from './reports.service';

const ids = {
  source: '507f1f77bcf86cd799439011',
  replacement: '507f1f77bcf86cd799439012',
  patient: '507f1f77bcf86cd799439013',
  visit: '507f1f77bcf86cd799439014',
  actor: '507f1f77bcf86cd799439015',
  instance: '507f1f77bcf86cd799439016',
  score: '507f1f77bcf86cd799439017',
  domain: '507f1f77bcf86cd799439018',
};
const lockId = '11111111-1111-4111-8111-111111111111';
const freezeId = '22222222-2222-4222-8222-222222222222';
const archiveId = '33333333-3333-4333-8333-333333333333';
const correctionId = '44444444-4444-4444-8444-444444444444';
const now = new Date('2026-07-12T09:30:00.000Z');
const sourceCode = 'RPT-A25-SOURCE-001';
const replacementCode = 'RPT-A25-REPLACEMENT-002';

function counts(value: number) {
  return {
    scaleInstanceCount: value,
    itemResponseCount: 0,
    scoreResultCount: value,
    cognitiveDomainResultCount: value,
    mediaEvidenceCount: 0,
    totalSourceCount: value * 3,
  };
}

function baseReport(): ClinicalReportSummary {
  return {
    id: ids.source,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    primaryScaleInstanceIds: [ids.instance],
    scoreResultIds: [ids.score],
    cognitiveDomainResultIds: [ids.domain],
    mediaEvidenceIds: [],
    subjectCode: 'SUBJ-A25-WORKFLOW-001',
    reportCode: sourceCode,
    reportType: 'cognitive_assessment',
    status: 'archived',
    reportVersion: 1,
    source: 'mixed',
    patientSnapshot: {
      subjectCode: 'SUBJ-A25-WORKFLOW-001',
      birthDate: null,
      educationYears: null,
    },
    visitSnapshot: {
      visitCode: 'VISIT-A25-WORKFLOW-001',
      assessmentDate: now,
      clinicalContext: null,
    },
    scaleTraces: [
      { scaleInstanceId: ids.instance, scaleCode: 'moca', scaleVersion: '1.0' },
    ],
    scoreSnapshots: [
      {
        scoreResultId: ids.score,
        scaleCode: 'moca',
        totalScoreValue: 20,
        totalMaxScore: 30,
        totalMinScore: 0,
        scorePercent: 66.67,
        scoreDetails: null,
      },
    ],
    domainSnapshots: [
      {
        cognitiveDomainResultId: ids.domain,
        scaleCode: 'moca',
        domainCode: 'memory',
        scoreValue: 4,
        maxScore: 5,
        scorePercent: 80,
        weightedScore: 4,
        weightedMaxScore: 5,
        itemCount: 1,
        needsReviewItemCount: 0,
      },
    ],
    evidenceSnapshots: [],
    narrative: {
      chiefSummary: 'A25 de-identified chief summary',
      scoreSummary: 'A25 de-identified score summary',
      domainSummary: 'A25 de-identified domain summary',
      evidenceSummary: 'A25 de-identified evidence summary',
      limitations: 'A25 de-identified limitations',
      doctorOpinion: 'A25 de-identified doctor opinion',
    },
    aiDraft: {
      aiAnalysisResultId: null,
      generatedAt: null,
      status: 'not_requested',
      doctorEdited: false,
    },
    confirmation: {
      confirmedAt: now,
      confirmedBy: ids.actor,
      confirmedByName: 'A25 Test Doctor',
      confirmedByRole: 'doctor',
      confirmationNote: 'A25 de-identified confirmation note',
    },
    lockedAt: now,
    lockedBy: ids.actor,
    archivedAt: now,
    archivedBy: ids.actor,
    correctionRecords: [],
    voidedAt: null,
    voidedBy: null,
    auditLogRefs: [],
    qualityStatus: 'passed',
    qualityHints: null,
    metadata: {
      a20Generation: {
        version: 1,
        generationId: 'generation-a25-workflow',
        generatedAt: now,
        generatedBy: ids.actor,
        generatedByName: 'A25 Test Doctor',
        generatedByRole: 'doctor',
        engineVersion: 'a20-clinical-report-draft-1.0',
        reportScope: 'explicit_primary_scale_instances',
        primaryScaleInstanceIds: [ids.instance],
        scoreResultIds: [ids.score],
        cognitiveDomainResultIds: [ids.domain],
        mediaEvidenceCount: 0,
        aiUsed: false,
      },
      a21Submission: {
        version: 1,
        submissionId: 'submission-a25-workflow',
        submittedAt: now,
        submittedBy: ids.actor,
        submittedByName: 'A25 Test Doctor',
        submittedByRole: 'doctor',
        submissionNote: 'A25 de-identified submission note',
      },
      a21Confirmation: {
        version: 1,
        confirmationId: 'confirmation-a25-workflow',
        confirmedAt: now,
        confirmedBy: ids.actor,
        confirmedByName: 'A25 Test Doctor',
        confirmedByRole: 'doctor',
        confirmationNote: 'A25 de-identified confirmation note',
      },
      a22Lock: {
        version: 1,
        lockId,
        lockedAt: now,
        lockedBy: ids.actor,
        lockedByName: 'A25 Test Doctor',
        lockedByRole: 'doctor',
        lockNote: 'A25 de-identified lock note',
      },
      a23SourceFreeze: {
        version: 1,
        state: 'completed',
        freezeId,
        startedAt: now,
        sourceLockedAt: now,
        startedBy: ids.actor,
        startedByName: 'A25 Test Doctor',
        startedByRole: 'doctor',
        freezeNote: 'A25 de-identified freeze note',
        scope: {
          scaleInstanceIds: [ids.instance],
          itemResponseIds: [],
          scoreResultIds: [ids.score],
          cognitiveDomainResultIds: [ids.domain],
          mediaEvidenceIds: [],
        },
        expectedCounts: counts(1),
        completedCounts: counts(1),
        newlyFrozenCounts: counts(1),
        previouslyFrozenCounts: counts(0),
        completedAt: now,
        completedBy: ids.actor,
        completedByName: 'A25 Test Doctor',
        completedByRole: 'doctor',
      },
      a24Archive: {
        version: 1,
        archiveId,
        archivedAt: now,
        archivedBy: ids.actor,
        archivedByName: 'A25 Test Doctor',
        archivedByRole: 'doctor',
        archiveNote: 'A25 de-identified archive note',
        sourceFreezeId: freezeId,
        sourceFreezeCompletedAt: now,
      },
    },
    createdAt: now,
    updatedAt: now,
  };
}

function completedSource(): ClinicalReportSummary {
  const source = baseReport();
  return {
    ...source,
    status: 'corrected',
    correctionRecords: [
      {
        correctionNo: 1,
        correctedAt: now,
        correctedBy: ids.actor,
        correctedByName: 'A25 Test Doctor',
        reason: '脱敏更正原因',
        changeSummary: '脱敏计划变更范围',
        previousReportCode: sourceCode,
        replacementReportCode: replacementCode,
        auditLogId: null,
      },
    ],
    metadata: {
      ...source.metadata,
      a25Correction: {
        version: 1,
        state: 'completed',
        correctionId,
        correctionNo: 1,
        startedAt: now,
        startedBy: ids.actor,
        startedByName: 'A25 Test Doctor',
        startedByRole: 'doctor',
        correctionReason: '脱敏更正原因',
        changeSummary: '脱敏计划变更范围',
        previousReportCode: sourceCode,
        previousReportVersion: 1,
        replacementReportCode: replacementCode,
        replacementReportVersion: 2,
        sourceArchiveId: '33333333-3333-4333-8333-333333333333',
        sourceArchivedAt: now,
        sourceFreezeId: '22222222-2222-4222-8222-222222222222',
        sourceFreezeCompletedAt: now,
        replacementReportId: ids.replacement,
        replacementCreatedAt: now,
        completedAt: now,
        completedBy: ids.actor,
        completedByName: 'A25 Test Doctor',
        completedByRole: 'doctor',
      },
    },
  };
}

function inProgressSource(recorded = false): ClinicalReportSummary {
  const source = baseReport();
  return {
    ...source,
    metadata: {
      ...source.metadata,
      a25Correction: {
        version: 1,
        state: 'in_progress',
        correctionId,
        correctionNo: 1,
        startedAt: now,
        startedBy: ids.actor,
        startedByName: 'A25 Test Doctor',
        startedByRole: 'doctor',
        correctionReason: '脱敏更正原因',
        changeSummary: '脱敏计划变更范围',
        previousReportCode: sourceCode,
        previousReportVersion: 1,
        replacementReportCode: replacementCode,
        replacementReportVersion: 2,
        sourceArchiveId: archiveId,
        sourceArchivedAt: now,
        sourceFreezeId: freezeId,
        sourceFreezeCompletedAt: now,
        ...(recorded
          ? {
              replacementReportId: ids.replacement,
              replacementCreatedAt: now,
            }
          : {}),
      },
    },
  };
}

function replacementReport(): ClinicalReportSummary {
  const source = baseReport();
  return {
    ...source,
    id: ids.replacement,
    reportCode: replacementCode,
    reportVersion: 2,
    status: 'draft',
    qualityStatus: 'needs_review',
    confirmation: null,
    lockedAt: null,
    lockedBy: null,
    archivedAt: null,
    archivedBy: null,
    metadata: {
      a20Generation: (source.metadata as Record<string, unknown>).a20Generation,
      a25CorrectionReplacement: {
        version: 1,
        correctionId,
        correctionNo: 1,
        previousReportId: ids.source,
        previousReportCode: sourceCode,
        previousReportVersion: 1,
        replacementReportCode: replacementCode,
        replacementReportVersion: 2,
        createdAt: now,
        createdBy: ids.actor,
        createdByName: 'A25 Test Doctor',
        createdByRole: 'doctor',
        correctionReason: '脱敏更正原因',
        changeSummary: '脱敏计划变更范围',
        sourceArchiveId: '33333333-3333-4333-8333-333333333333',
        sourceArchivedAt: now,
        sourceFreezeId: '22222222-2222-4222-8222-222222222222',
        sourceFreezeCompletedAt: now,
      },
    },
  };
}

const doctor: AuthenticatedUserContext = {
  id: ids.actor,
  accountName: 'a25-doctor',
  displayName: 'A25 Test Doctor',
  roles: ['doctor'],
  permissions: [],
};

function correctionInput() {
  return {
    confirm: true as const,
    correctionReason: 'new text must not overwrite original reason',
    changeSummary: 'new text must not overwrite original summary',
    expectedUpdatedAt: now.toISOString(),
  };
}

async function expectConflictCode(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected ${code}`);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual(
      expect.objectContaining({ code }),
    );
  }
}

describe('ClinicalReportCorrectionWorkflowService', () => {
  let service: ClinicalReportCorrectionWorkflowService;
  let patients: { findPatientById: jest.Mock };
  let assessments: { findVisitByPatientAndId: jest.Mock };
  let reports: {
    findReportByOwnership: jest.Mock;
    findCorrectionReplacementByCode: jest.Mock;
    findLatestReportByVisitId: jest.Mock;
    listReportsByVisitTypeVersion: jest.Mock;
    startCorrectionIfUnmodified: jest.Mock;
    createCorrectionReplacement: jest.Mock;
    isDuplicateKeyError: jest.Mock;
    recordCorrectionReplacementIfMatching: jest.Mock;
    completeCorrectionIfMatching: jest.Mock;
  };

  beforeEach(async () => {
    patients = {
      findPatientById: jest.fn().mockResolvedValue({
        id: ids.patient,
        status: 'inactive',
      }),
    };
    assessments = {
      findVisitByPatientAndId: jest.fn().mockResolvedValue({
        id: ids.visit,
        status: 'voided',
      }),
    };
    reports = {
      findReportByOwnership: jest.fn().mockResolvedValue(completedSource()),
      findCorrectionReplacementByCode: jest
        .fn()
        .mockResolvedValue(replacementReport()),
      findLatestReportByVisitId: jest.fn().mockResolvedValue(baseReport()),
      listReportsByVisitTypeVersion: jest.fn().mockResolvedValue([]),
      startCorrectionIfUnmodified: jest.fn().mockResolvedValue(null),
      createCorrectionReplacement: jest
        .fn()
        .mockResolvedValue(replacementReport()),
      isDuplicateKeyError: jest.fn().mockReturnValue(false),
      recordCorrectionReplacementIfMatching: jest
        .fn()
        .mockResolvedValue(inProgressSource(true)),
      completeCorrectionIfMatching: jest
        .fn()
        .mockResolvedValue(completedSource()),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClinicalReportCorrectionWorkflowService,
        ClinicalReportPublicMapper,
        { provide: PatientsService, useValue: patients },
        { provide: AssessmentsService, useValue: assessments },
        { provide: ReportsService, useValue: reports },
      ],
    }).compile();
    service = moduleRef.get(ClinicalReportCorrectionWorkflowService);
  });

  it('requires strict confirmation before reading clinical resources', async () => {
    await expect(
      service.createClinicalReportCorrection(
        ids.patient,
        ids.visit,
        ids.source,
        doctor,
        {
          confirm: false,
          correctionReason: 'valid reason',
          changeSummary: 'valid summary',
          expectedUpdatedAt: now.toISOString(),
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(patients.findPatientById).not.toHaveBeenCalled();
  });

  it('returns stable ownership not-found errors', async () => {
    patients.findPatientById.mockResolvedValueOnce(null);
    await expect(
      service.createClinicalReportCorrection(
        ids.patient,
        ids.visit,
        ids.source,
        doctor,
        {
          confirm: true,
          correctionReason: 'valid reason',
          changeSummary: 'valid summary',
          expectedUpdatedAt: now.toISOString(),
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns completed idempotency with old expectedUpdatedAt and no writes', async () => {
    const response = await service.createClinicalReportCorrection(
      ids.patient,
      ids.visit,
      ids.source,
      doctor,
      {
        confirm: true,
        correctionReason: 'new text must not overwrite',
        changeSummary: 'new text must not overwrite',
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
      },
    );
    expect(response.correctionReceipt).toMatchObject({
      correctionId,
      alreadyCreated: true,
      resumedExisting: false,
      correctionReason: '脱敏更正原因',
      changeSummary: '脱敏计划变更范围',
    });
    expect(response.sourceReport.status).toBe('corrected');
    expect(response.replacementReport.reportVersion).toBe(2);
    expect(response.replacementReport.replacementOf).not.toBeNull();
  });

  it('rejects non-doctor/admin actors and invalid completed audit safely', async () => {
    await expect(
      service.createClinicalReportCorrection(
        ids.patient,
        ids.visit,
        ids.source,
        { ...doctor, roles: ['nurse'] },
        {
          confirm: true,
          correctionReason: 'valid reason',
          changeSummary: 'valid summary',
          expectedUpdatedAt: now.toISOString(),
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const source = completedSource();
    source.metadata = { a25Correction: { version: 2 } };
    reports.findReportByOwnership.mockResolvedValueOnce(source);
    await expect(
      service.createClinicalReportCorrection(
        ids.patient,
        ids.visit,
        ids.source,
        doctor,
        {
          confirm: true,
          correctionReason: 'valid reason',
          changeSummary: 'valid summary',
          expectedUpdatedAt: now.toISOString(),
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('U1 resumes the source correction when latest already switched', async () => {
    reports.findReportByOwnership
      .mockResolvedValueOnce(baseReport())
      .mockResolvedValueOnce(completedSource());
    reports.findLatestReportByVisitId.mockResolvedValueOnce(
      replacementReport(),
    );

    const response = await service.createClinicalReportCorrection(
      ids.patient,
      ids.visit,
      ids.source,
      doctor,
      correctionInput(),
    );

    expect(response.correctionReceipt).toEqual(
      expect.objectContaining({
        correctionId,
        alreadyCreated: true,
        resumedExisting: false,
        correctionReason: '脱敏更正原因',
        changeSummary: '脱敏计划变更范围',
      }),
    );
    expect(response.correctionReceipt.startedBy).toMatchObject({
      operatorId: ids.actor,
      operatorRole: 'doctor',
    });
    expect(reports.startCorrectionIfUnmodified).not.toHaveBeenCalled();
    expect(reports.createCorrectionReplacement).not.toHaveBeenCalled();
    expect(reports.listReportsByVisitTypeVersion).not.toHaveBeenCalled();
  });

  it('U2 resumes when the next version appears during preflight', async () => {
    reports.findReportByOwnership
      .mockResolvedValueOnce(baseReport())
      .mockResolvedValueOnce(completedSource());
    reports.findLatestReportByVisitId.mockResolvedValueOnce(baseReport());
    reports.listReportsByVisitTypeVersion.mockResolvedValueOnce([
      replacementReport(),
    ]);

    const response = await service.createClinicalReportCorrection(
      ids.patient,
      ids.visit,
      ids.source,
      doctor,
      correctionInput(),
    );

    expect(response.correctionReceipt).toEqual(
      expect.objectContaining({
        correctionId,
        alreadyCreated: true,
        resumedExisting: false,
        correctionReason: '脱敏更正原因',
        changeSummary: '脱敏计划变更范围',
      }),
    );
    expect(reports.startCorrectionIfUnmodified).not.toHaveBeenCalled();
    expect(reports.createCorrectionReplacement).not.toHaveBeenCalled();
  });

  it('U3 accepts the deterministic replacement created during continuation', async () => {
    reports.findReportByOwnership.mockResolvedValueOnce(inProgressSource());
    reports.findCorrectionReplacementByCode.mockResolvedValueOnce(null);
    reports.listReportsByVisitTypeVersion.mockResolvedValueOnce([
      replacementReport(),
    ]);
    reports.recordCorrectionReplacementIfMatching.mockResolvedValueOnce(
      inProgressSource(true),
    );
    reports.completeCorrectionIfMatching.mockResolvedValueOnce(
      completedSource(),
    );

    const response = await service.createClinicalReportCorrection(
      ids.patient,
      ids.visit,
      ids.source,
      doctor,
      correctionInput(),
    );

    expect(response.correctionReceipt).toEqual(
      expect.objectContaining({
        correctionId,
        alreadyCreated: false,
        resumedExisting: true,
        correctionReason: '脱敏更正原因',
        changeSummary: '脱敏计划变更范围',
      }),
    );
    expect(reports.createCorrectionReplacement).not.toHaveBeenCalled();
    expect(reports.recordCorrectionReplacementIfMatching).toHaveBeenCalledWith(
      expect.objectContaining({
        correctionId,
        replacementReportId: ids.replacement,
        replacementReportCode: replacementCode,
        replacementReportVersion: 2,
      }),
    );
    expect(reports.completeCorrectionIfMatching).toHaveBeenCalledTimes(1);
  });

  it('U4 keeps a genuine non-latest source rejected', async () => {
    reports.findReportByOwnership
      .mockResolvedValueOnce(baseReport())
      .mockResolvedValueOnce(baseReport());
    reports.findLatestReportByVisitId.mockResolvedValueOnce(
      replacementReport(),
    );

    await expectConflictCode(
      service.createClinicalReportCorrection(
        ids.patient,
        ids.visit,
        ids.source,
        doctor,
        correctionInput(),
      ),
      'CLINICAL_REPORT_CORRECTION_NOT_LATEST',
    );

    expect(reports.startCorrectionIfUnmodified).not.toHaveBeenCalled();
    expect(reports.createCorrectionReplacement).not.toHaveBeenCalled();
  });

  it('U5 keeps a next-version branch without a source audit rejected', async () => {
    reports.findReportByOwnership
      .mockResolvedValueOnce(baseReport())
      .mockResolvedValueOnce(baseReport());
    reports.findLatestReportByVisitId.mockResolvedValueOnce(baseReport());
    reports.listReportsByVisitTypeVersion.mockResolvedValueOnce([
      replacementReport(),
    ]);

    await expectConflictCode(
      service.createClinicalReportCorrection(
        ids.patient,
        ids.visit,
        ids.source,
        doctor,
        correctionInput(),
      ),
      'CLINICAL_REPORT_CORRECTION_REPLACEMENT_CONFLICT',
    );

    expect(reports.startCorrectionIfUnmodified).not.toHaveBeenCalled();
    expect(reports.createCorrectionReplacement).not.toHaveBeenCalled();
  });

  it('U6 keeps a non-deterministic continuation collision rejected', async () => {
    reports.findReportByOwnership.mockResolvedValueOnce(inProgressSource());
    reports.findCorrectionReplacementByCode.mockResolvedValueOnce(null);
    reports.listReportsByVisitTypeVersion.mockResolvedValueOnce([
      {
        ...replacementReport(),
        reportCode: 'RPT-A25-UNRELATED-REPLACEMENT',
      },
    ]);

    await expectConflictCode(
      service.createClinicalReportCorrection(
        ids.patient,
        ids.visit,
        ids.source,
        doctor,
        correctionInput(),
      ),
      'CLINICAL_REPORT_CORRECTION_REPLACEMENT_CONFLICT',
    );

    expect(reports.createCorrectionReplacement).not.toHaveBeenCalled();
    expect(
      reports.recordCorrectionReplacementIfMatching,
    ).not.toHaveBeenCalled();
    expect(reports.completeCorrectionIfMatching).not.toHaveBeenCalled();
  });
});
