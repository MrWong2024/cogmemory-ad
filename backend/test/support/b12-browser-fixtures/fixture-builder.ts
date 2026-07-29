import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { AssessmentVisitDocument } from '../../../src/modules/assessments/schemas/assessment-visit.schema';
import type { ScaleInstanceDocument } from '../../../src/modules/assessments/schemas/scale-instance.schema';
import type { PatientDocument } from '../../../src/modules/patients/schemas/patient.schema';
import type { ClinicalReportDocument } from '../../../src/modules/reports/schemas/clinical-report.schema';
import type { ScaleDefinitionDocument } from '../../../src/modules/scales/schemas/scale-definition.schema';
import type { ScaleVersionDocument } from '../../../src/modules/scales/schemas/scale-version.schema';
import type { UserDocument } from '../../../src/modules/users/schemas/user.schema';
import {
  instanceCodeFor,
  reportCodeFor,
  routeOrdinalFor,
  scenariosFor,
  subjectCodeFor,
  visitCodeFor,
} from './fixture-contract';
import {
  B12FixtureError,
  type B12PreparedState,
  type B12Profile,
} from './fixture-types';

export type B12FixtureModels = {
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  scaleInstances: Model<ScaleInstanceDocument>;
  reports: Model<ClinicalReportDocument>;
  scaleDefinitions: Model<ScaleDefinitionDocument>;
  scaleVersions: Model<ScaleVersionDocument>;
};

export type B12RouteRoot = {
  scenarioKey: string;
  routeKey: string;
  patient: PatientDocument;
  visit: AssessmentVisitDocument;
  instance: ScaleInstanceDocument;
  report: ClinicalReportDocument;
};

export const B12_BASE_DATE = new Date('2026-07-29T02:00:00.000Z');

const SYSTEM_NARRATIVE = {
  chiefSummary: 'B12 synthetic system section one with no clinical meaning.',
  scoreSummary: 'B12 synthetic system section two with no clinical meaning.',
  domainSummary: 'B12 synthetic system section three with no clinical meaning.',
  evidenceSummary:
    'B12 synthetic system section four with no clinical meaning.',
  limitations: 'B12 synthetic system section five with no clinical meaning.',
};

const CLINICIAN_OPINION =
  'B12 synthetic clinician opinion text with no clinical meaning.';
const CLINICIAN_RECOMMENDATION =
  'B12 synthetic clinician recommendation text with no clinical meaning.';
const SUBMISSION_NOTE =
  'B12 synthetic submission note with no clinical meaning.';
const CONFIRMATION_NOTE =
  'B12 synthetic confirmation note with no clinical meaning.';
const LOCK_NOTE = 'B12 synthetic lock process text with no clinical meaning.';

export function b12RouteDate(ordinal: number, offset = 0): Date {
  return new Date(B12_BASE_DATE.getTime() + ordinal * 600_000 + offset);
}

function ownershipMarker(input: {
  profile: B12Profile;
  namespace: string;
  scenarioKey: string;
  routeKey: string;
  preparedState: B12PreparedState;
  routeOrdinal: number;
}) {
  return {
    version: 1,
    profile: input.profile,
    namespace: input.namespace,
    scenarioKey: input.scenarioKey,
    routeKey: input.routeKey,
    preparedState: input.preparedState,
    routeOrdinal: input.routeOrdinal,
  };
}

function lifecycleFor(state: B12PreparedState) {
  return {
    draft: state === 'draft',
    pending: state === 'pending_confirmation',
    confirmationMissing: state === 'confirmed_confirmation_missing',
    locked:
      state === 'confirmed_locked' || state === 'historical_locked_fallback',
    historical: state === 'historical_locked_fallback',
    qualityBlocked: state === 'confirmed_quality_blocked',
  };
}

export class B12FixtureBuilder {
  constructor(
    private readonly profile: B12Profile,
    private readonly namespace: string,
    private readonly models: B12FixtureModels,
  ) {}

  async buildAll(doctor: UserDocument): Promise<void> {
    const [definition, version] = await Promise.all([
      this.models.scaleDefinitions.findOne({ code: 'mmse' }).exec(),
      this.models.scaleVersions
        .findOne({ scaleCode: 'mmse', status: 'active' })
        .sort({ version: -1, _id: 1 })
        .exec(),
    ]);
    if (!definition || !version) {
      throw new B12FixtureError(
        'B12_FIXTURE_CANONICAL_SEED_UNAVAILABLE',
        'Canonical MMSE readiness must exist before B12 roots are built',
        this.profile,
      );
    }
    for (const scenario of scenariosFor(this.profile)) {
      for (const routeValue of scenario.routes) {
        await this.buildRoute(
          scenario.scenarioKey,
          routeValue.key,
          routeValue.preparedState,
          doctor,
          definition,
          version,
        );
      }
    }
  }

  private async buildRoute(
    scenarioKey: string,
    routeKey: string,
    preparedState: B12PreparedState,
    doctor: UserDocument,
    definition: ScaleDefinitionDocument,
    version: ScaleVersionDocument,
  ): Promise<void> {
    const ordinal = routeOrdinalFor(this.profile, scenarioKey, routeKey);
    const marker = ownershipMarker({
      profile: this.profile,
      namespace: this.namespace,
      scenarioKey,
      routeKey,
      preparedState,
      routeOrdinal: ordinal,
    });
    const subjectCode = subjectCodeFor(
      this.profile,
      this.namespace,
      scenarioKey,
      routeKey,
    );
    const patient = await this.models.patients.create({
      subjectCode,
      displayName: `B12 synthetic subject ${String(ordinal).padStart(2, '0')}`,
      sourceType: ordinal % 2 === 0 ? 'research' : 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: ['batch-d', 'b12', this.profile, 'synthetic', 'deidentified'],
      notes: 'B12 synthetic subject note with no clinical meaning.',
      externalRefs: null,
      metadata: { b12Fixture: marker },
    });
    const visitStatus =
      preparedState === 'confirmed_v1_visit_locked'
        ? 'locked'
        : preparedState === 'confirmed_v1_visit_voided'
          ? 'voided'
          : 'completed';
    const visit = await this.models.visits.create({
      patientId: patient._id,
      subjectCode,
      visitCode: visitCodeFor(
        this.profile,
        this.namespace,
        scenarioKey,
        routeKey,
      ),
      visitType: 'follow_up',
      status: visitStatus,
      assessmentDate: b12RouteDate(ordinal),
      startedAt: b12RouteDate(ordinal, 1000),
      completedAt: b12RouteDate(ordinal, 2000),
      lockedAt: visitStatus === 'locked' ? b12RouteDate(ordinal, 3000) : null,
      voidedAt: visitStatus === 'voided' ? b12RouteDate(ordinal, 3000) : null,
      operatorSnapshot: {
        operatorId: doctor._id,
        operatorName: doctor.displayName,
        operatorRole: 'doctor',
      },
      clinicalContext: null,
      notes: 'B12 synthetic visit note with no clinical meaning.',
      metadata: { b12Fixture: marker },
    });
    const instance = await this.models.scaleInstances.create({
      assessmentVisitId: visit._id,
      patientId: patient._id,
      subjectCode,
      scaleDefinitionId: definition._id,
      scaleVersionId: version._id,
      scaleCode: 'mmse',
      scaleVersion: version.version,
      instanceCode: instanceCodeFor(
        this.profile,
        this.namespace,
        scenarioKey,
        routeKey,
      ),
      instanceNo: 1,
      status: 'completed',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: version.crfVersion,
        scoringRuleVersion: version.scoringRuleVersion,
        fieldEncodingVersion: version.fieldEncodingVersion,
        sourceDocument: 'B12 synthetic fixture source without item content',
      },
      startedAt: b12RouteDate(ordinal, 1000),
      completedAt: b12RouteDate(ordinal, 2000),
      lockedAt: null,
      voidedAt: null,
      durationMs: null,
      operatorSnapshot: {
        operatorId: doctor._id,
        operatorName: doctor.displayName,
        operatorRole: 'doctor',
      },
      progress: null,
      qualityControlSummary: null,
      notes: 'B12 synthetic execution root with no response content.',
      metadata: { b12Fixture: marker },
    });
    await this.models.reports.create(
      this.reportDocument({
        scenarioKey,
        routeKey,
        preparedState,
        ordinal,
        doctor,
        patientId: patient._id,
        visitId: visit._id,
        instanceId: instance._id,
        subjectCode,
        visitCode: visit.visitCode,
        scaleVersion: version.version,
        crfVersion: version.crfVersion,
        scoringRuleVersion: version.scoringRuleVersion,
        fieldEncodingVersion: version.fieldEncodingVersion,
      }),
    );
  }

  private reportDocument(input: {
    scenarioKey: string;
    routeKey: string;
    preparedState: B12PreparedState;
    ordinal: number;
    doctor: UserDocument;
    patientId: Types.ObjectId;
    visitId: Types.ObjectId;
    instanceId: Types.ObjectId;
    subjectCode: string;
    visitCode: string;
    scaleVersion: string;
    crfVersion?: string;
    scoringRuleVersion?: string;
    fieldEncodingVersion?: string;
  }): Record<string, unknown> {
    const state = lifecycleFor(input.preparedState);
    const submitted = !state.draft;
    const confirmed = !state.draft && !state.pending;
    const hasConfirmation = confirmed && !state.confirmationMissing;
    const submittedAt = b12RouteDate(input.ordinal, 220_000);
    const confirmedAt = b12RouteDate(input.ordinal, 240_000);
    const lockedAt = state.locked ? b12RouteDate(input.ordinal, 260_000) : null;
    const scoreResultId = new Types.ObjectId();
    const cognitiveDomainResultId = new Types.ObjectId();
    const metadata: Record<string, unknown> = {
      a20Generation: {
        version: 1,
        generationId: `b12-generation-${input.ordinal}`,
        generatedAt: b12RouteDate(input.ordinal, 10_000),
        generatedBy: input.doctor._id.toString(),
        generatedByName: input.doctor.displayName,
        generatedByRole: 'doctor',
        engineVersion: 'a20-rules-v1',
        reportScope: 'selected_scale_instances',
        primaryScaleInstanceIds: [input.instanceId.toString()],
        scoreResultIds: [scoreResultId.toString()],
        cognitiveDomainResultIds: [cognitiveDomainResultId.toString()],
        mediaEvidenceCount: 0,
        aiUsed: false,
      },
      b12FixtureOwnership: {
        version: 1,
        profile: this.profile,
        namespace: this.namespace,
        scenarioKey: input.scenarioKey,
        routeKey: input.routeKey,
        preparedState: input.preparedState,
      },
    };
    if (!state.draft) {
      metadata.a21Edits = {
        version: 1,
        events: [
          {
            eventId: `b12-edit-${input.ordinal}-1`,
            editedAt: b12RouteDate(input.ordinal, 200_000),
            editedBy: input.doctor._id.toString(),
            editedByName: input.doctor.displayName,
            editedByRole: 'doctor',
            changedFields: ['doctorOpinion', 'recommendationText'],
            previousValues: {
              doctorOpinion: null,
              recommendationText: null,
            },
            nextValues: {
              doctorOpinion: CLINICIAN_OPINION,
              recommendationText: CLINICIAN_RECOMMENDATION,
            },
            editNote: 'B12 synthetic edit note with no clinical meaning.',
          },
        ],
        lastEditedAt: b12RouteDate(input.ordinal, 200_000),
        lastEditedBy: input.doctor._id.toString(),
      };
    }
    if (submitted) {
      metadata.a21Submission = {
        version: 1,
        submissionId: `b12-submission-${input.ordinal}`,
        submittedAt,
        submittedBy: input.doctor._id.toString(),
        submittedByName: input.doctor.displayName,
        submittedByRole: 'doctor',
        submissionNote: SUBMISSION_NOTE,
      };
    }
    if (hasConfirmation) {
      metadata.a21Confirmation = {
        version: 1,
        confirmationId: `b12-confirmation-${input.ordinal}`,
        confirmedAt,
        confirmedBy: input.doctor._id.toString(),
        confirmedByName: input.doctor.displayName,
        confirmedByRole: 'doctor',
        confirmationNote: CONFIRMATION_NOTE,
      };
    }
    if (state.locked && !state.historical && lockedAt) {
      metadata.a22Lock = {
        version: 1,
        lockId: `00000000-0000-4000-8000-${String(input.ordinal).padStart(12, '0')}`,
        lockedAt,
        lockedBy: input.doctor._id.toString(),
        lockedByName: input.doctor.displayName,
        lockedByRole: 'doctor',
        lockNote: LOCK_NOTE,
      };
    }
    return {
      patientId: input.patientId,
      assessmentVisitId: input.visitId,
      primaryScaleInstanceIds: [input.instanceId],
      scoreResultIds: [scoreResultId],
      cognitiveDomainResultIds: [cognitiveDomainResultId],
      mediaEvidenceIds: [],
      subjectCode: input.subjectCode,
      reportCode: reportCodeFor(
        this.profile,
        this.namespace,
        input.scenarioKey,
        input.routeKey,
      ),
      reportType: 'cognitive_assessment',
      status: state.draft
        ? 'draft'
        : state.pending
          ? 'pending_confirmation'
          : 'confirmed',
      reportVersion: 1,
      source: state.draft ? 'system_draft' : 'mixed',
      patientSnapshot: {
        subjectCode: input.subjectCode,
        displayName: 'B12 synthetic subject display',
        sex: 'unknown',
        birthDate: null,
        educationYears: null,
      },
      visitSnapshot: {
        visitCode: input.visitCode,
        visitType: 'follow_up',
        assessmentDate: b12RouteDate(input.ordinal),
        operatorName: input.doctor.displayName,
        operatorRole: 'doctor',
        clinicalContext: null,
      },
      scaleTraces: [
        {
          scaleInstanceId: input.instanceId,
          scaleCode: 'mmse',
          scaleVersion: input.scaleVersion,
          crfVersion: input.crfVersion,
          scoringRuleVersion: input.scoringRuleVersion,
          fieldEncodingVersion: input.fieldEncodingVersion,
          domainMappingVersion: 'a19-domain-mapping-v1',
          sourceDocument: 'B12 synthetic fixture trace without item content',
        },
      ],
      scoreSnapshots: [
        {
          scoreResultId,
          scaleCode: 'mmse',
          scaleName: 'B12 synthetic scale snapshot',
          scaleVersion: input.scaleVersion,
          totalScoreValue: 1,
          totalMaxScore: 1,
          totalMinScore: 0,
          scorePercent: 100,
          scoreStatus: 'confirmed',
          qualityStatus: 'passed',
          summary: 'B12 synthetic score summary with no clinical meaning.',
          scoreDetails: null,
        },
      ],
      domainSnapshots: [
        {
          cognitiveDomainResultId,
          scaleCode: 'mmse',
          domainCode: 'b12_synthetic_domain',
          domainTitle: 'B12 synthetic domain',
          scoreValue: 1,
          maxScore: 1,
          scorePercent: 100,
          weightedScore: 1,
          weightedMaxScore: 1,
          itemCount: 1,
          needsReviewItemCount: 0,
          summary: 'B12 synthetic domain summary with no clinical meaning.',
        },
      ],
      evidenceSnapshots: [],
      narrative: {
        ...SYSTEM_NARRATIVE,
        ...(!state.draft
          ? {
              doctorOpinion: CLINICIAN_OPINION,
              recommendationText: CLINICIAN_RECOMMENDATION,
            }
          : {}),
      },
      aiDraft: { status: 'not_requested', doctorEdited: false },
      confirmation: hasConfirmation
        ? {
            confirmedAt,
            confirmedBy: input.doctor._id,
            confirmedByName: input.doctor.displayName,
            confirmedByRole: 'doctor',
            confirmationNote: CONFIRMATION_NOTE,
          }
        : null,
      lockedAt,
      lockedBy: state.locked ? input.doctor._id : null,
      archivedAt: null,
      archivedBy: null,
      correctionRecords: [],
      voidedAt: null,
      voidedBy: null,
      auditLogRefs: [],
      qualityStatus: state.qualityBlocked ? 'needs_review' : 'passed',
      qualityHints: null,
      operatorNote: 'B12 synthetic operator note with no clinical meaning.',
      metadata,
    };
  }
}
