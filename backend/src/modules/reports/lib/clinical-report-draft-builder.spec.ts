import type { ScaleInstanceSummary } from '../../assessments/services/assessments.service';
import type { CognitiveDomainResultSummary } from '../../cognitive-domains/services/cognitive-domains.service';
import type { MediaEvidenceSummary } from '../../media/services/media-evidence.service';
import type {
  ScaleDefinitionSummary,
  ScaleVersionSummary,
} from '../../scales/services/scales.service';
import type { ScoreResultSummary } from '../../scoring/services/scoring.service';
import type { ClinicalReportSelectedScaleSource } from '../types/clinical-report-generation.types';
import {
  A20_REPORT_ENGINE_VERSION,
  A20_REPORT_SCOPE,
  buildClinicalReportCode,
  buildClinicalReportDraft,
} from './clinical-report-draft-builder';

const ids = {
  patient: '507f1f77bcf86cd799439011',
  visit: '507f1f77bcf86cd799439012',
  instance1: '507f1f77bcf86cd799439013',
  instance2: '507f1f77bcf86cd799439014',
  definition1: '507f1f77bcf86cd799439015',
  definition2: '507f1f77bcf86cd799439016',
  version1: '507f1f77bcf86cd799439017',
  version2: '507f1f77bcf86cd799439018',
  score1: '507f1f77bcf86cd799439019',
  score2: '507f1f77bcf86cd799439020',
  domain1: '507f1f77bcf86cd799439021',
  domain2: '507f1f77bcf86cd799439022',
  item: '507f1f77bcf86cd799439023',
  media: '507f1f77bcf86cd799439024',
  actor: '507f1f77bcf86cd799439025',
};

function createSource(
  scaleCode: string,
  instanceId: string,
  definitionId: string,
  versionId: string,
  scoreId: string,
  domainId: string,
  instanceNo: number,
): ClinicalReportSelectedScaleSource {
  const scaleInstance: ScaleInstanceSummary = {
    id: instanceId,
    assessmentVisitId: ids.visit,
    patientId: ids.patient,
    subjectCode: 'SUBJ-A20-TEST-001',
    scaleDefinitionId: definitionId,
    scaleVersionId: versionId,
    scaleCode,
    scaleVersion: '1.0',
    instanceCode: `INST-A20-${scaleCode.toUpperCase()}`,
    instanceNo,
    status: 'completed',
    administrationMode: 'clinician_administered',
    versionTrace: {
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-1',
      fieldEncodingVersion: 'field-1',
      sourceDocument: 'MMSE+MoCA.pdf',
    },
    startedAt: null,
    completedAt: new Date('2026-07-11T08:00:00.000Z'),
    lockedAt: null,
    voidedAt: null,
    durationMs: null,
    operatorSnapshot: null,
    progress: null,
    qualityControlSummary: null,
    metadata: null,
  };
  const scaleDefinition: ScaleDefinitionSummary = {
    id: definitionId,
    code: scaleCode,
    name: `${scaleCode.toUpperCase()} 脱敏量表`,
    category: 'cognitive',
    status: 'active',
    currentVersionId: versionId,
    sortOrder: instanceNo,
    tags: [],
  };
  const scaleVersion: ScaleVersionSummary = {
    id: versionId,
    scaleDefinitionId: definitionId,
    scaleCode,
    version: '1.0',
    crfVersion: 'crf-current-ignored',
    scoringRuleVersion: 'score-current-ignored',
    fieldEncodingVersion: 'field-current-ignored',
    sourceDocument: 'current-source-ignored',
    status: 'active',
    totalScoreRange: { min: 0, max: 30 },
    groups: [],
    items: [],
    qualityControlRules: null,
    reportingRules: null,
    researchExportMappings: null,
    effectiveFrom: null,
    retiredAt: null,
  };
  const scoreResult: ScoreResultSummary = {
    id: scoreId,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    scaleInstanceId: instanceId,
    subjectCode: 'SUBJ-A20-TEST-001',
    scaleDefinitionId: definitionId,
    scaleVersionId: versionId,
    scaleCode,
    scaleVersion: '1.0',
    instanceCode: scaleInstance.instanceCode,
    scoreResultCode: `SCR-A20-${scaleCode.toUpperCase()}`,
    runNo: 1,
    status: 'confirmed',
    scoringSource: 'mixed',
    scoringMode: 'rule_based',
    versionTrace: null,
    totalScore: {
      scoreValue: 20,
      maxScore: 30,
      minScore: 0,
      scorePercent: 66.67,
      scoredItemCount: 1,
      totalItemCount: 1,
      unscoredItemCount: 0,
      missingItemCount: 0,
      needsReviewItemCount: 0,
    },
    itemScores: [
      {
        itemResponseId: ids.item,
        itemCode: `${scaleCode}.item`,
        itemOrder: 1,
        countsTowardTotal: true,
        includedInTotal: true,
        scoreValue: 20,
        maxScore: 30,
        minScore: 0,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        isMissing: false,
        cognitiveDomainCodes: ['memory'],
      },
    ],
    groupScores: [],
    computation: {
      computedAt: new Date('2026-07-11T08:10:00.000Z'),
      computedBy: null,
      inputItemCount: 1,
      includedItemCount: 1,
      excludedItemCount: 0,
      warningCount: 0,
    },
    review: {
      reviewStatus: 'reviewed',
      reviewedAt: new Date('2026-07-11T08:20:00.000Z'),
      reviewerId: ids.actor,
    },
    qualityStatus: 'passed',
    qualityHints: null,
    metadata: null,
    confirmedAt: new Date('2026-07-11T08:20:00.000Z'),
    lockedAt: null,
    voidedAt: null,
    createdAt: new Date('2026-07-11T08:10:00.000Z'),
    updatedAt: new Date('2026-07-11T08:20:00.000Z'),
  };
  const cognitiveDomainResult: CognitiveDomainResultSummary = {
    id: domainId,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    scaleInstanceId: instanceId,
    scoreResultId: scoreId,
    subjectCode: 'SUBJ-A20-TEST-001',
    scaleDefinitionId: definitionId,
    scaleVersionId: versionId,
    scaleCode,
    scaleVersion: '1.0',
    instanceCode: scaleInstance.instanceCode,
    domainResultCode: `CDR-A20-${scaleCode.toUpperCase()}`,
    runNo: 1,
    status: 'computed',
    mappingSource: 'scale_config',
    mappingMode: 'item_domain_codes',
    versionTrace: { domainMappingVersion: 'a19-item-domain-codes-1.0' },
    domainScores: [
      {
        domainCode: 'memory',
        domainTitle: '记忆',
        scoreValue: 20,
        maxScore: 30,
        minScore: 0,
        scorePercent: 66.67,
        weightedScore: 20,
        weightedMaxScore: 30,
        itemCount: 1,
        scoredItemCount: 1,
        unscoredItemCount: 0,
        missingItemCount: 0,
        needsReviewItemCount: 0,
        excludedItemCount: 0,
      },
    ],
    itemContributions: [
      {
        itemResponseId: ids.item,
        scoreResultId: scoreId,
        itemCode: `${scaleCode}.item`,
        itemOrder: 1,
        domainCode: 'memory',
        weight: 1,
        countsTowardDomain: true,
        scoreValue: 20,
        maxScore: 30,
        weightedScore: 20,
        weightedMaxScore: 30,
        scoreStatus: 'manual_scored',
        scoreSource: 'operator',
        isMissing: false,
      },
    ],
    mappingSnapshot: null,
    computation: {
      computedAt: new Date('2026-07-11T08:30:00.000Z'),
      computedBy: ids.actor,
      inputItemCount: 1,
      contributionCount: 1,
      domainCount: 1,
      includedContributionCount: 1,
      excludedContributionCount: 0,
      warningCount: 0,
    },
    review: {
      reviewStatus: 'not_required',
      reviewedAt: null,
      reviewerId: null,
    },
    qualityStatus: 'unchecked',
    qualityHints: null,
    metadata: null,
    confirmedAt: null,
    lockedAt: null,
    voidedAt: null,
    createdAt: new Date('2026-07-11T08:30:00.000Z'),
    updatedAt: new Date('2026-07-11T08:30:00.000Z'),
  };
  return {
    scaleInstance,
    scaleDefinition,
    scaleVersion,
    scoreResult,
    cognitiveDomainResult,
  };
}

function createMedia(): MediaEvidenceSummary {
  return {
    id: ids.media,
    patientId: ids.patient,
    assessmentVisitId: ids.visit,
    scaleInstanceId: ids.instance1,
    itemResponseId: ids.item,
    subjectCode: 'SUBJ-A20-TEST-001',
    scaleDefinitionId: ids.definition1,
    scaleVersionId: ids.version1,
    scaleCode: 'moca',
    scaleVersion: '1.0',
    instanceCode: 'INST-A20-MOCA',
    itemCode: 'moca.item',
    evidenceCode: 'EVD-A20-001',
    evidenceType: 'handwriting',
    captureMode: 'tablet_handwriting',
    status: 'locked',
    storageStatus: 'stored',
    itemTitle: '脱敏绘图题',
    countsTowardTotal: true,
    cognitiveDomainCodes: ['visuospatial'],
    itemSnapshot: null,
    versionTrace: null,
    storage: {
      storageDriver: 'fake',
      objectKey: 'test/a20/internal-object',
      sizeBytes: 68,
      storedAt: new Date('2026-07-11T08:00:00.000Z'),
    },
    imageMetadata: null,
    handwritingTrace: null,
    captureContext: null,
    operatorSnapshot: null,
    qualityStatus: 'needs_review',
    qualityHints: null,
    metadata: null,
    lockedAt: new Date('2026-07-11T08:00:00.000Z'),
    voidedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-07-11T08:00:00.000Z'),
    updatedAt: new Date('2026-07-11T08:00:00.000Z'),
  };
}

describe('clinical-report-draft-builder', () => {
  it('builds a stable privacy-safe deterministic report code', () => {
    const input = {
      patientId: ids.patient,
      visitId: ids.visit,
      reportType: 'cognitive_assessment',
      reportVersion: 1,
    };
    const first = buildClinicalReportCode(input);
    expect(first).toBe(buildClinicalReportCode(input));
    expect(first).toMatch(/^RPT-[A-F0-9]{24}$/);
    expect(first).not.toContain(ids.patient);
    expect(first).not.toContain(ids.visit);
    expect(
      buildClinicalReportCode({ ...input, visitId: ids.instance1 }),
    ).not.toBe(first);
  });

  it('builds controlled snapshots, narrative, metadata and stable scope', () => {
    const moca = createSource(
      'moca',
      ids.instance1,
      ids.definition1,
      ids.version1,
      ids.score1,
      ids.domain1,
      2,
    );
    const mmse = createSource(
      'mmse',
      ids.instance2,
      ids.definition2,
      ids.version2,
      ids.score2,
      ids.domain2,
      1,
    );
    const media = createMedia();
    const patient = {
      id: ids.patient,
      subjectCode: 'SUBJ-A20-TEST-001',
      displayName: '脱敏受试者',
      sourceType: 'clinical' as const,
      sex: 'unknown' as const,
      birthDate: null,
      educationYears: 12,
      handedness: 'unknown' as const,
      status: 'active' as const,
      tags: ['must-not-copy'],
      notes: 'must-not-copy',
      externalRefs: { mustNotCopy: true },
      metadata: { mustNotCopy: true },
    };
    const visit = {
      id: ids.visit,
      patientId: ids.patient,
      subjectCode: patient.subjectCode,
      visitCode: 'VISIT-A20-TEST-001',
      visitType: 'baseline' as const,
      status: 'completed' as const,
      assessmentDate: new Date('2026-07-11T08:00:00.000Z'),
      startedAt: null,
      completedAt: null,
      lockedAt: null,
      voidedAt: null,
      operatorSnapshot: {
        operatorId: ids.actor,
        operatorName: '脱敏医生',
        operatorRole: 'doctor' as const,
      },
      clinicalContext: { mustNotCopy: true },
      notes: 'must-not-copy',
      metadata: { mustNotCopy: true },
    };
    const result = buildClinicalReportDraft({
      patient,
      visit,
      selectedScaleSources: [moca, mmse],
      mediaEvidence: [media],
      generatedAt: new Date('2026-07-11T09:00:00.000Z'),
      actor: { id: ids.actor, name: '脱敏医生', role: 'doctor' },
    });

    expect(result.primaryScaleInstanceIds).toEqual([
      ids.instance2,
      ids.instance1,
    ]);
    expect(result.reportType).toBe('cognitive_assessment');
    expect(result.reportVersion).toBe(1);
    expect(result.status).toBe('draft');
    expect(result.source).toBe('system_draft');
    expect(result.qualityStatus).toBe('needs_review');
    expect(result.patientSnapshot).toEqual({
      subjectCode: patient.subjectCode,
      displayName: patient.displayName,
      sex: patient.sex,
      birthDate: null,
      educationYears: 12,
    });
    expect(result.patientSnapshot).not.toHaveProperty('metadata');
    expect(result.visitSnapshot.clinicalContext).toBeNull();
    expect(result.scaleTraces[0]).toEqual(
      expect.objectContaining({
        scaleCode: 'mmse',
        crfVersion: 'crf-1',
        domainMappingVersion: 'a19-item-domain-codes-1.0',
      }),
    );
    expect(
      result.scoreSnapshots.every((item) => item.scoreDetails === null),
    ).toBe(true);
    expect(result.domainSnapshots[0]).not.toHaveProperty('minScore');
    expect(result.evidenceSnapshots[0]).toEqual(
      expect.objectContaining({
        storageObjectKey: 'test/a20/internal-object',
        qualityStatus: 'needs_review',
      }),
    );
    expect(typeof result.narrative.chiefSummary).toBe('string');
    expect(typeof result.narrative.scoreSummary).toBe('string');
    expect(typeof result.narrative.domainSummary).toBe('string');
    expect(typeof result.narrative.evidenceSummary).toBe('string');
    expect(typeof result.narrative.limitations).toBe('string');
    expect(result.narrative).not.toHaveProperty('trendSummary');
    expect(result.narrative).not.toHaveProperty('recommendationText');
    expect(result.narrative).not.toHaveProperty('doctorOpinion');
    expect(JSON.stringify(result.narrative)).not.toContain('must-not-copy');
    expect(result.aiDraft).toEqual({
      status: 'not_requested',
      doctorEdited: false,
    });
    expect(result.confirmation).toBeNull();
    expect(result.metadata.a20Generation).toEqual(
      expect.objectContaining({
        version: 1,
        generatedBy: ids.actor,
        engineVersion: A20_REPORT_ENGINE_VERSION,
        reportScope: A20_REPORT_SCOPE,
        aiUsed: false,
        mediaEvidenceCount: 1,
      }),
    );
    expect(result).not.toHaveProperty('operatorNote');
  });
});
