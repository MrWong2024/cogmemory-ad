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
};
const correctionId = '44444444-4444-4444-8444-444444444444';
const now = new Date('2026-07-12T09:30:00.000Z');
const sourceCode = 'RPT-A25-SOURCE-001';
const replacementCode = 'RPT-A25-REPLACEMENT-002';

function baseReport(): ClinicalReportSummary {
  return {
    id: ids.source,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    primaryScaleInstanceIds: [],
    scoreResultIds: [],
    cognitiveDomainResultIds: [],
    mediaEvidenceIds: [],
    subjectCode: 'SUBJ-A25-WORKFLOW-001',
    reportCode: sourceCode,
    reportType: 'cognitive_assessment',
    status: 'corrected',
    reportVersion: 1,
    source: 'mixed',
    patientSnapshot: null,
    visitSnapshot: null,
    scaleTraces: [],
    scoreSnapshots: [],
    domainSnapshots: [],
    evidenceSnapshots: [],
    narrative: null,
    aiDraft: null,
    confirmation: null,
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
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

function completedSource(): ClinicalReportSummary {
  return {
    ...baseReport(),
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

function replacementReport(): ClinicalReportSummary {
  return {
    ...baseReport(),
    id: ids.replacement,
    reportCode: replacementCode,
    reportVersion: 2,
    status: 'draft',
    qualityStatus: 'needs_review',
    lockedAt: null,
    lockedBy: null,
    archivedAt: null,
    archivedBy: null,
    metadata: {
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

describe('ClinicalReportCorrectionWorkflowService', () => {
  let service: ClinicalReportCorrectionWorkflowService;
  let patients: { findPatientById: jest.Mock };
  let assessments: { findVisitByPatientAndId: jest.Mock };
  let reports: {
    findReportByOwnership: jest.Mock;
    findCorrectionReplacementByCode: jest.Mock;
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
});
