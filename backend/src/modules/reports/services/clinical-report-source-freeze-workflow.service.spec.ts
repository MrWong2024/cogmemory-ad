import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { CognitiveDomainsService } from '../../cognitive-domains/services/cognitive-domains.service';
import { MediaEvidenceService } from '../../media/services/media-evidence.service';
import { PatientsService } from '../../patients/services/patients.service';
import { ScoringService } from '../../scoring/services/scoring.service';
import type { ClinicalReportResponse } from '../types/clinical-report-response.types';
import { ClinicalReportPublicMapper } from './clinical-report-public.mapper';
import { ClinicalReportSourceFreezeWorkflowService } from './clinical-report-source-freeze-workflow.service';
import type { ClinicalReportSummary } from './reports.service';
import { ReportsService } from './reports.service';

const ids = {
  report: '507f1f77bcf86cd799439011',
  patient: '507f1f77bcf86cd799439012',
  visit: '507f1f77bcf86cd799439013',
  scale: '507f1f77bcf86cd799439014',
  item: '507f1f77bcf86cd799439015',
  score: '507f1f77bcf86cd799439016',
  domain: '507f1f77bcf86cd799439017',
  actor: '507f1f77bcf86cd799439018',
};

const counts = {
  scaleInstanceCount: 1,
  itemResponseCount: 1,
  scoreResultCount: 1,
  cognitiveDomainResultCount: 1,
  mediaEvidenceCount: 0,
  totalSourceCount: 4,
};

const currentUser: AuthenticatedUserContext = {
  id: ids.actor,
  accountName: 'doctor-a23-test',
  displayName: 'A23 Test Doctor',
  roles: ['doctor'],
  permissions: [],
};

function completedReport(): ClinicalReportSummary {
  const startedAt = new Date('2026-07-12T08:00:00.000Z');
  const completedAt = new Date('2026-07-12T08:01:00.000Z');
  return {
    id: ids.report,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    primaryScaleInstanceIds: [ids.scale],
    scoreResultIds: [ids.score],
    cognitiveDomainResultIds: [ids.domain],
    mediaEvidenceIds: [],
    metadata: {
      a23SourceFreeze: {
        version: 1,
        freezeId: '11111111-1111-4111-8111-111111111111',
        state: 'completed',
        startedAt,
        sourceLockedAt: startedAt,
        startedBy: ids.actor,
        startedByName: 'A23 Test Doctor',
        startedByRole: 'doctor',
        freezeNote: 'A23 de-identified source freeze note',
        scope: {
          scaleInstanceIds: [ids.scale],
          itemResponseIds: [ids.item],
          scoreResultIds: [ids.score],
          cognitiveDomainResultIds: [ids.domain],
          mediaEvidenceIds: [],
        },
        expectedCounts: counts,
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
        completedByName: 'A23 Test Doctor',
        completedByRole: 'doctor',
        completedCounts: counts,
        newlyFrozenCounts: counts,
      },
    },
  } as unknown as ClinicalReportSummary;
}

describe('ClinicalReportSourceFreezeWorkflowService', () => {
  const patientsService = {
    findPatientById: jest.fn(),
  };
  const assessmentsService = {
    findVisitByPatientAndId: jest.fn(),
    listScaleInstancesByIds: jest.fn(),
    listItemResponsesByIds: jest.fn(),
    listItemResponsesByScaleInstanceIds: jest.fn(),
    freezeScaleInstancesByIds: jest.fn(),
    freezeItemResponsesByIds: jest.fn(),
  };
  const scoringService = {
    listScoreResultsByIds: jest.fn(),
    freezeScoreResultsByIds: jest.fn(),
  };
  const cognitiveDomainsService = {
    listCognitiveDomainResultsByIds: jest.fn(),
    freezeCognitiveDomainResultsByIds: jest.fn(),
  };
  const mediaEvidenceService = {
    listMediaEvidenceByIds: jest.fn(),
    freezeMediaEvidenceByIds: jest.fn(),
  };
  const reportsService = {
    findReportByOwnership: jest.fn(),
    hasValidReplacementLifecycleLineage: jest.fn().mockResolvedValue(true),
    startSourceFreezeIfUnmodified: jest.fn(),
    completeSourceFreezeIfMatching: jest.fn(),
  };
  const publicReport = { id: ids.report } as ClinicalReportResponse;
  const publicMapper = {
    toPublicReport: jest.fn().mockReturnValue(publicReport),
  };
  const service = new ClinicalReportSourceFreezeWorkflowService(
    patientsService as unknown as PatientsService,
    assessmentsService as unknown as AssessmentsService,
    scoringService as unknown as ScoringService,
    cognitiveDomainsService as unknown as CognitiveDomainsService,
    mediaEvidenceService as unknown as MediaEvidenceService,
    reportsService as unknown as ReportsService,
    publicMapper as unknown as ClinicalReportPublicMapper,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires explicit confirmation before loading any resources', async () => {
    let caught: unknown;
    try {
      await service.freezeClinicalReportSources(
        ids.patient,
        ids.visit,
        ids.report,
        currentUser,
        {
          confirm: false,
          freezeNote: 'A23 de-identified source freeze note',
          expectedUpdatedAt: '2026-07-12T08:00:00.000Z',
        },
      );
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    if (!(caught instanceof BadRequestException)) {
      throw new Error('Expected BadRequestException');
    }
    expect(caught.getResponse()).toEqual(
      expect.objectContaining({
        code: 'CLINICAL_REPORT_SOURCE_FREEZE_CONFIRMATION_REQUIRED',
      }),
    );
    expect(patientsService.findPatientById).not.toHaveBeenCalled();
  });

  it('returns a completed audit idempotently without touching source rows', async () => {
    const report = completedReport();
    patientsService.findPatientById.mockResolvedValue({
      id: ids.patient,
      status: 'active',
    });
    assessmentsService.findVisitByPatientAndId.mockResolvedValue({
      id: ids.visit,
      status: 'completed',
    });
    reportsService.findReportByOwnership.mockResolvedValue(report);

    const result = await service.freezeClinicalReportSources(
      ids.patient,
      ids.visit,
      ids.report,
      currentUser,
      {
        confirm: true,
        freezeNote: 'A23 retry note must not replace the original',
        expectedUpdatedAt: '2026-07-12T00:00:00.000Z',
      },
    );

    expect(result.report).toBe(publicReport);
    expect(result.sourceFreezeReceipt).toEqual(
      expect.objectContaining({
        freezeId: '11111111-1111-4111-8111-111111111111',
        freezeNote: 'A23 de-identified source freeze note',
        alreadyFrozen: true,
        resumedExisting: false,
      }),
    );
    expect(assessmentsService.listScaleInstancesByIds).not.toHaveBeenCalled();
    expect(reportsService.startSourceFreezeIfUnmodified).not.toHaveBeenCalled();
    expect(
      reportsService.completeSourceFreezeIfMatching,
    ).not.toHaveBeenCalled();
  });

  it('returns the stable lineage conflict for an invalid V2 replacement', async () => {
    const report = { ...completedReport(), reportVersion: 2 };
    patientsService.findPatientById.mockResolvedValue({
      id: ids.patient,
      status: 'inactive',
    });
    assessmentsService.findVisitByPatientAndId.mockResolvedValue({
      id: ids.visit,
      status: 'voided',
    });
    reportsService.findReportByOwnership.mockResolvedValue(report);
    reportsService.hasValidReplacementLifecycleLineage.mockResolvedValueOnce(
      false,
    );

    await expect(
      service.freezeClinicalReportSources(
        ids.patient,
        ids.visit,
        ids.report,
        currentUser,
        {
          confirm: true,
          freezeNote: 'A26 de-identified replacement freeze note',
          expectedUpdatedAt: '2026-07-12T00:00:00.000Z',
        },
      ),
    ).rejects.toMatchObject({
      response: { code: 'CLINICAL_REPORT_REPLACEMENT_LINEAGE_INVALID' },
    });
    expect(reportsService.startSourceFreezeIfUnmodified).not.toHaveBeenCalled();
  });
});
