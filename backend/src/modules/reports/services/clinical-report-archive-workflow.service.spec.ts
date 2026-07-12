import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AssessmentVisitSummary } from '../../assessments/services/assessments.service';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import type { PatientSummary } from '../../patients/services/patients.service';
import { PatientsService } from '../../patients/services/patients.service';
import { ClinicalReportPublicMapper } from './clinical-report-public.mapper';
import { ClinicalReportArchiveWorkflowService } from './clinical-report-archive-workflow.service';
import type { ClinicalReportSummary } from './reports.service';
import { ReportsService } from './reports.service';

const ids = {
  report: '507f1f77bcf86cd799439011',
  patient: '507f1f77bcf86cd799439012',
  visit: '507f1f77bcf86cd799439013',
  instance: '507f1f77bcf86cd799439014',
  score: '507f1f77bcf86cd799439015',
  domain: '507f1f77bcf86cd799439016',
  actor: '507f1f77bcf86cd799439017',
};
const updatedAt = new Date('2026-07-12T09:00:00.000Z');
const lockedAt = new Date('2026-07-12T08:00:00.000Z');
const completedAt = new Date('2026-07-12T08:30:00.000Z');
const freezeId = '22222222-2222-4222-8222-222222222222';

function readyReport(
  overrides: Partial<ClinicalReportSummary> = {},
): ClinicalReportSummary {
  const actorName = 'A24 Test Doctor';
  return {
    id: ids.report,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    primaryScaleInstanceIds: [ids.instance],
    scoreResultIds: [ids.score],
    cognitiveDomainResultIds: [ids.domain],
    mediaEvidenceIds: [],
    subjectCode: 'SUBJ-A24-TEST-001',
    reportCode: 'RPT-A24-TEST-001',
    reportType: 'cognitive_assessment',
    status: 'confirmed',
    reportVersion: 1,
    source: 'mixed',
    patientSnapshot: {
      subjectCode: 'SUBJ-A24-TEST-001',
      birthDate: null,
      educationYears: null,
    },
    visitSnapshot: {
      visitCode: 'VISIT-A24-TEST-001',
      assessmentDate: lockedAt,
      clinicalContext: null,
    },
    scaleTraces: [{ scaleInstanceId: ids.instance, scaleCode: 'moca' }],
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
      chiefSummary: '规则化主摘要',
      scoreSummary: '规则化评分摘要',
      domainSummary: '规则化认知域摘要',
      evidenceSummary: '规则化证据摘要',
      limitations: '规则化限制说明',
      doctorOpinion: '脱敏人工意见',
    },
    aiDraft: null,
    confirmation: {
      confirmedAt: new Date('2026-07-12T07:30:00.000Z'),
      confirmedBy: ids.actor,
      confirmedByName: actorName,
      confirmedByRole: 'doctor',
      confirmationNote: '脱敏确认说明',
    },
    lockedAt,
    lockedBy: ids.actor,
    archivedAt: null,
    archivedBy: null,
    correctionRecords: [],
    voidedAt: null,
    voidedBy: null,
    auditLogRefs: [],
    qualityStatus: 'passed',
    qualityHints: null,
    metadata: {
      a20Generation: {
        version: 1,
        generationId: 'generation-a24-test',
        generatedAt: new Date('2026-07-12T07:00:00.000Z'),
        generatedBy: ids.actor,
        generatedByName: actorName,
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
        submissionId: 'submission-a24-test',
        submittedAt: new Date('2026-07-12T07:15:00.000Z'),
        submittedBy: ids.actor,
        submittedByName: actorName,
        submittedByRole: 'doctor',
        submissionNote: '脱敏提交说明',
      },
      a21Confirmation: {
        version: 1,
        confirmationId: 'confirmation-a24-test',
        confirmedAt: new Date('2026-07-12T07:30:00.000Z'),
        confirmedBy: ids.actor,
        confirmedByName: actorName,
        confirmedByRole: 'doctor',
        confirmationNote: '脱敏确认说明',
      },
      a22Lock: {
        version: 1,
        lockId: '11111111-1111-4111-8111-111111111111',
        lockedAt,
        lockedBy: ids.actor,
        lockedByName: actorName,
        lockedByRole: 'doctor',
        lockNote: '脱敏锁定说明',
      },
      a23SourceFreeze: {
        version: 1,
        state: 'completed',
        freezeId,
        startedAt: lockedAt,
        sourceLockedAt: lockedAt,
        startedBy: ids.actor,
        startedByName: actorName,
        startedByRole: 'doctor',
        freezeNote: '脱敏来源冻结说明',
        scope: {
          scaleInstanceIds: [ids.instance],
          itemResponseIds: [],
          scoreResultIds: [ids.score],
          cognitiveDomainResultIds: [ids.domain],
          mediaEvidenceIds: [],
        },
        expectedCounts: {
          scaleInstanceCount: 1,
          itemResponseCount: 0,
          scoreResultCount: 1,
          cognitiveDomainResultCount: 1,
          mediaEvidenceCount: 0,
          totalSourceCount: 3,
        },
        completedCounts: {
          scaleInstanceCount: 1,
          itemResponseCount: 0,
          scoreResultCount: 1,
          cognitiveDomainResultCount: 1,
          mediaEvidenceCount: 0,
          totalSourceCount: 3,
        },
        newlyFrozenCounts: {
          scaleInstanceCount: 1,
          itemResponseCount: 0,
          scoreResultCount: 1,
          cognitiveDomainResultCount: 1,
          mediaEvidenceCount: 0,
          totalSourceCount: 3,
        },
        previouslyFrozenCounts: {
          scaleInstanceCount: 0,
          itemResponseCount: 0,
          scoreResultCount: 0,
          cognitiveDomainResultCount: 0,
          mediaEvidenceCount: 0,
          totalSourceCount: 0,
        },
        completedAt,
        completedBy: ids.actor,
        completedByName: actorName,
        completedByRole: 'doctor',
      },
    },
    createdAt: new Date('2026-07-12T06:30:00.000Z'),
    updatedAt,
    ...overrides,
  };
}

describe('ClinicalReportArchiveWorkflowService', () => {
  let service: ClinicalReportArchiveWorkflowService;
  let patientsService: { findPatientById: jest.Mock };
  let assessmentsService: { findVisitByPatientAndId: jest.Mock };
  let reportsService: {
    findReportByOwnership: jest.Mock;
    archiveReportIfUnmodified: jest.Mock;
    canTransitionReportStatus: jest.Mock;
  };
  let publicMapper: { toPublicReport: jest.Mock };
  const patient = {
    id: ids.patient,
    status: 'inactive',
  } as PatientSummary;
  const visit = { id: ids.visit, status: 'locked' } as AssessmentVisitSummary;
  const currentUser = {
    id: ids.actor,
    accountName: 'doctor-a24-test',
    displayName: 'A24 Test Doctor',
    roles: ['doctor'],
    permissions: [],
  };
  const input = {
    confirm: true,
    archiveNote: '脱敏归档说明',
    expectedUpdatedAt: updatedAt.toISOString(),
  };

  beforeEach(async () => {
    patientsService = { findPatientById: jest.fn().mockResolvedValue(patient) };
    assessmentsService = {
      findVisitByPatientAndId: jest.fn().mockResolvedValue(visit),
    };
    reportsService = {
      findReportByOwnership: jest.fn().mockResolvedValue(readyReport()),
      archiveReportIfUnmodified: jest.fn(),
      canTransitionReportStatus: jest.fn().mockReturnValue(true),
    };
    publicMapper = {
      toPublicReport: jest.fn().mockReturnValue({ id: ids.report }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClinicalReportArchiveWorkflowService,
        { provide: PatientsService, useValue: patientsService },
        { provide: AssessmentsService, useValue: assessmentsService },
        { provide: ReportsService, useValue: reportsService },
        { provide: ClinicalReportPublicMapper, useValue: publicMapper },
      ],
    }).compile();
    service = moduleRef.get(ClinicalReportArchiveWorkflowService);
  });

  it('requires explicit confirmation and an authenticated doctor/admin actor', async () => {
    await expect(
      service.archiveClinicalReport(
        ids.patient,
        ids.visit,
        ids.report,
        currentUser,
        { ...input, confirm: false },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.archiveClinicalReport(
        ids.patient,
        ids.visit,
        ids.report,
        { ...currentUser, roles: ['nurse'] },
        input,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('archives an inactive patient and locked visit because they are ownership-only', async () => {
    const archivedAt = new Date('2026-07-12T09:10:00.000Z');
    const archived = readyReport({
      status: 'archived',
      archivedAt,
      archivedBy: ids.actor,
    });
    reportsService.archiveReportIfUnmodified.mockImplementation(
      (mutation: { metadata: Record<string, unknown> }) =>
        Promise.resolve({ ...archived, metadata: mutation.metadata }),
    );

    const result = await service.archiveClinicalReport(
      ids.patient,
      ids.visit,
      ids.report,
      currentUser,
      input,
    );

    expect(reportsService.archiveReportIfUnmodified).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: ids.report,
        patientId: ids.patient,
        assessmentVisitId: ids.visit,
        expectedUpdatedAt: updatedAt,
        archivedBy: ids.actor,
      }),
    );
    expect(typeof result.archiveReceipt.archiveId).toBe('string');
    expect(result.archiveReceipt.archivedBy.operatorId).toBe(ids.actor);
    expect(result.archiveReceipt).toEqual(
      expect.objectContaining({
        archiveNote: input.archiveNote,
        sourceFreezeId: freezeId,
        alreadyArchived: false,
      }),
    );
  });

  it('returns an existing archive with stale expectedUpdatedAt without writing', async () => {
    const archivedAt = new Date('2026-07-12T09:10:00.000Z');
    reportsService.findReportByOwnership.mockResolvedValue(
      readyReport({
        status: 'archived',
        archivedAt,
        archivedBy: ids.actor,
        metadata: null,
        updatedAt: new Date('2026-07-12T09:11:00.000Z'),
      }),
    );
    const result = await service.archiveClinicalReport(
      ids.patient,
      ids.visit,
      ids.report,
      currentUser,
      { ...input, expectedUpdatedAt: '2020-01-01T00:00:00.000Z' },
    );
    expect(result.archiveReceipt).toEqual(
      expect.objectContaining({ archiveId: null, alreadyArchived: true }),
    );
    expect(reportsService.archiveReportIfUnmodified).not.toHaveBeenCalled();
  });

  it('returns conflict after an atomic miss when updatedAt changed', async () => {
    reportsService.archiveReportIfUnmodified.mockResolvedValue(null);
    reportsService.findReportByOwnership
      .mockResolvedValueOnce(readyReport())
      .mockResolvedValueOnce(
        readyReport({
          updatedAt: new Date('2026-07-12T09:01:00.000Z'),
        }),
      );
    await expect(
      service.archiveClinicalReport(
        ids.patient,
        ids.visit,
        ids.report,
        currentUser,
        input,
      ),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_ARCHIVE_CONFLICT' },
    });
  });

  it('maps ownership, audit and persistence failures safely', async () => {
    patientsService.findPatientById.mockResolvedValueOnce(null);
    await expect(
      service.archiveClinicalReport(
        ids.patient,
        ids.visit,
        ids.report,
        currentUser,
        input,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    reportsService.findReportByOwnership.mockResolvedValueOnce(
      readyReport({ status: 'draft' }),
    );
    reportsService.canTransitionReportStatus.mockReturnValueOnce(false);
    await expect(
      service.archiveClinicalReport(
        ids.patient,
        ids.visit,
        ids.report,
        currentUser,
        input,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    reportsService.findReportByOwnership.mockResolvedValueOnce(readyReport());
    reportsService.canTransitionReportStatus.mockReturnValueOnce(true);
    reportsService.archiveReportIfUnmodified.mockRejectedValueOnce(
      new Error('database details must not escape'),
    );
    await expect(
      service.archiveClinicalReport(
        ids.patient,
        ids.visit,
        ids.report,
        currentUser,
        input,
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
