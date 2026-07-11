import { createHash, randomUUID } from 'crypto';
import type { MediaQualityStatus } from '../../media/schemas/media-evidence.schema';
import type { ClinicalReportDraftBuilderInput } from '../types/clinical-report-generation.types';
import type {
  CreateClinicalReportInput,
  ReportEvidenceSnapshotSummary,
} from '../services/reports.service';

export const A20_REPORT_ENGINE_VERSION = 'a20-clinical-report-draft-1.0';
export const A20_REPORT_SCOPE = 'explicit_primary_scale_instances';

type BuildClinicalReportCodeInput = {
  patientId: string;
  visitId: string;
  reportType: string;
  reportVersion: number;
};

export function buildClinicalReportCode(
  input: BuildClinicalReportCodeInput,
): string {
  const digest = createHash('sha256')
    .update(
      [
        'a20',
        input.patientId.trim().toLowerCase(),
        input.visitId.trim().toLowerCase(),
        input.reportType,
        String(input.reportVersion),
      ].join(':'),
      'utf8',
    )
    .digest('hex')
    .slice(0, 24)
    .toUpperCase();
  return `RPT-${digest}`;
}

function compareText(left: string | undefined, right: string | undefined) {
  return (left ?? '').localeCompare(right ?? '');
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapEvidenceQuality(
  status: MediaQualityStatus,
): ReportEvidenceSnapshotSummary['qualityStatus'] {
  if (status === 'acceptable') {
    return 'passed';
  }
  if (status === 'needs_review') {
    return 'needs_review';
  }
  if (status === 'unusable') {
    return 'failed';
  }
  return 'unchecked';
}

export function buildClinicalReportDraft(
  input: ClinicalReportDraftBuilderInput,
): CreateClinicalReportInput {
  const selectedScaleSources = [...input.selectedScaleSources].sort(
    (left, right) =>
      compareText(
        left.scaleInstance.scaleCode,
        right.scaleInstance.scaleCode,
      ) ||
      left.scaleInstance.instanceNo - right.scaleInstance.instanceNo ||
      left.scaleInstance.id.localeCompare(right.scaleInstance.id),
  );
  const evidence = [...input.mediaEvidence].sort(
    (left, right) =>
      compareText(left.scaleCode, right.scaleCode) ||
      compareText(left.itemCode, right.itemCode) ||
      compareText(left.evidenceType, right.evidenceType) ||
      left.id.localeCompare(right.id),
  );
  const scoreSnapshots = selectedScaleSources
    .map(({ scaleDefinition, scaleInstance, scoreResult }) => ({
      scoreResultId: scoreResult.id,
      scaleCode: scaleInstance.scaleCode,
      scaleName: scaleDefinition.name,
      scaleVersion: scaleInstance.scaleVersion,
      totalScoreValue: finiteOrNull(scoreResult.totalScore?.scoreValue),
      totalMaxScore: finiteOrNull(scoreResult.totalScore?.maxScore),
      totalMinScore: finiteOrNull(scoreResult.totalScore?.minScore),
      scorePercent: finiteOrNull(scoreResult.totalScore?.scorePercent),
      scoreStatus: scoreResult.status,
      qualityStatus: scoreResult.qualityStatus,
      summary: '本摘要仅记录已确认评分结果的结构化数值，不解释临床含义。',
      scoreDetails: null,
    }))
    .sort(
      (left, right) =>
        compareText(left.scaleCode, right.scaleCode) ||
        compareText(left.scaleVersion, right.scaleVersion) ||
        compareText(left.scoreResultId, right.scoreResultId),
    );
  const domainSnapshots = selectedScaleSources
    .flatMap(({ scaleInstance, cognitiveDomainResult }) =>
      cognitiveDomainResult.domainScores.map((score) => ({
        cognitiveDomainResultId: cognitiveDomainResult.id,
        scaleCode: scaleInstance.scaleCode,
        domainCode: score.domainCode,
        domainTitle: score.domainTitle,
        scoreValue: finiteOrNull(score.scoreValue),
        maxScore: finiteOrNull(score.maxScore),
        scorePercent: finiteOrNull(score.scorePercent),
        weightedScore: finiteOrNull(score.weightedScore),
        weightedMaxScore: finiteOrNull(score.weightedMaxScore),
        itemCount: score.itemCount,
        needsReviewItemCount: score.needsReviewItemCount,
        summary:
          '认知域采用重叠归因；scorePercent 不是诊断概率，且不得跨域求和解释为量表总分。',
      })),
    )
    .sort(
      (left, right) =>
        compareText(left.scaleCode, right.scaleCode) ||
        compareText(left.domainCode, right.domainCode),
    );
  const evidenceSnapshots = evidence.map((item) => ({
    mediaEvidenceId: item.id,
    itemResponseId: item.itemResponseId,
    scaleCode: item.scaleCode,
    itemCode: item.itemCode,
    itemTitle: item.itemTitle,
    evidenceType: item.evidenceType,
    captureMode: item.captureMode,
    storageObjectKey: item.storage?.objectKey,
    qualityStatus: mapEvidenceQuality(item.qualityStatus),
    summary: '本条仅为图片或手写证据的索引与审计快照，未分析媒体内容。',
  }));
  const generationId = randomUUID();
  const primaryScaleInstanceIds = selectedScaleSources.map(
    ({ scaleInstance }) => scaleInstance.id,
  );
  const scoreResultIds = selectedScaleSources.map(
    ({ scoreResult }) => scoreResult.id,
  );
  const cognitiveDomainResultIds = selectedScaleSources.map(
    ({ cognitiveDomainResult }) => cognitiveDomainResult.id,
  );
  const mediaEvidenceIds = evidence.map((item) => item.id);
  const hasNeedsReviewEvidence = evidence.some(
    (item) => item.qualityStatus === 'needs_review',
  );

  return {
    patientId: input.patient.id,
    assessmentVisitId: input.visit.id,
    primaryScaleInstanceIds,
    scoreResultIds,
    cognitiveDomainResultIds,
    mediaEvidenceIds,
    subjectCode: input.patient.subjectCode,
    reportCode: buildClinicalReportCode({
      patientId: input.patient.id,
      visitId: input.visit.id,
      reportType: 'cognitive_assessment',
      reportVersion: 1,
    }),
    reportType: 'cognitive_assessment',
    status: 'draft',
    reportVersion: 1,
    source: 'system_draft',
    patientSnapshot: {
      subjectCode: input.patient.subjectCode,
      displayName: input.patient.displayName,
      sex: input.patient.sex,
      birthDate: input.patient.birthDate,
      educationYears: input.patient.educationYears,
    },
    visitSnapshot: {
      visitCode: input.visit.visitCode,
      visitType: input.visit.visitType,
      assessmentDate: input.visit.assessmentDate,
      operatorName: input.visit.operatorSnapshot?.operatorName,
      operatorRole: input.visit.operatorSnapshot?.operatorRole,
      clinicalContext: null,
    },
    scaleTraces: selectedScaleSources.map(
      ({ scaleInstance, scaleVersion, cognitiveDomainResult }) => ({
        scaleInstanceId: scaleInstance.id,
        scaleCode: scaleInstance.scaleCode,
        scaleVersion: scaleInstance.scaleVersion,
        crfVersion:
          scaleInstance.versionTrace?.crfVersion ?? scaleVersion.crfVersion,
        scoringRuleVersion:
          scaleInstance.versionTrace?.scoringRuleVersion ??
          scaleVersion.scoringRuleVersion,
        fieldEncodingVersion:
          scaleInstance.versionTrace?.fieldEncodingVersion ??
          scaleVersion.fieldEncodingVersion,
        domainMappingVersion:
          cognitiveDomainResult.versionTrace?.domainMappingVersion,
        sourceDocument:
          scaleInstance.versionTrace?.sourceDocument ??
          scaleVersion.sourceDocument,
      }),
    ),
    scoreSnapshots,
    domainSnapshots,
    evidenceSnapshots,
    narrative: {
      chiefSummary: `本报告为系统规则化认知评估报告草稿，共纳入 ${selectedScaleSources.length} 份量表实例，不形成疾病结论。`,
      scoreSummary: `本报告纳入 ${scoreSnapshots.length} 份已确认评分结果，具体分值见结构化评分摘要，不解释分数临床含义。`,
      domainSummary:
        '认知域结果来自题目认知域编码的确定性映射，采用重叠归因，不得跨认知域求和解释为量表总分；scorePercent 不是诊断概率。',
      evidenceSummary: `本报告纳入 ${evidenceSnapshots.length} 条有效图片或手写证据摘要；系统未对媒体内容进行自动识别或判断。`,
      limitations:
        '当前报告为 draft，尚未经医生确认；认知域结果尚未独立确认；未使用 AI；不包含诊断阈值、疾病判断、治疗建议或趋势分析；需结合临床访谈、病史和其他检查综合判断。',
    },
    aiDraft: { status: 'not_requested', doctorEdited: false },
    confirmation: null,
    lockedAt: null,
    archivedAt: null,
    correctionRecords: [],
    voidedAt: null,
    auditLogRefs: [],
    qualityStatus: hasNeedsReviewEvidence ? 'needs_review' : 'unchecked',
    qualityHints: null,
    metadata: {
      a20Generation: {
        version: 1,
        generationId,
        generatedAt: new Date(input.generatedAt.getTime()),
        generatedBy: input.actor.id,
        generatedByName: input.actor.name,
        generatedByRole: input.actor.role,
        engineVersion: A20_REPORT_ENGINE_VERSION,
        reportScope: A20_REPORT_SCOPE,
        primaryScaleInstanceIds: [...primaryScaleInstanceIds],
        scoreResultIds: [...scoreResultIds],
        cognitiveDomainResultIds: [...cognitiveDomainResultIds],
        mediaEvidenceCount: mediaEvidenceIds.length,
        aiUsed: false,
      },
    },
  };
}
