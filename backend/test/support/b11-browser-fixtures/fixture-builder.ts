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
  B11FixtureError,
  type B11PreparedState,
  type B11Profile,
} from './fixture-types';

export type B11FixtureModels = {
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  scaleInstances: Model<ScaleInstanceDocument>;
  reports: Model<ClinicalReportDocument>;
  scaleDefinitions: Model<ScaleDefinitionDocument>;
  scaleVersions: Model<ScaleVersionDocument>;
};

export type B11RouteRoot = {
  scenarioKey: string;
  routeKey: string;
  patient: PatientDocument;
  visit: AssessmentVisitDocument;
  instance: ScaleInstanceDocument;
  report: ClinicalReportDocument;
};

const BASE_DATE = new Date('2026-07-28T02:00:00.000Z');
const SYSTEM_NARRATIVE = {
  chiefSummary: 'B11 synthetic system section one with no clinical meaning.',
  scoreSummary: 'B11 synthetic system section two with no clinical meaning.',
  domainSummary: 'B11 synthetic system section three with no clinical meaning.',
  evidenceSummary:
    'B11 synthetic system section four with no clinical meaning.',
  limitations: 'B11 synthetic system section five with no clinical meaning.',
};
const CLINICIAN_OPINION =
  'B11 synthetic clinician opinion text with no clinical meaning.';
const CLINICIAN_RECOMMENDATION =
  'B11 synthetic clinician recommendation text with no clinical meaning.';

function routeDate(ordinal: number, offset = 0): Date {
  return new Date(BASE_DATE.getTime() + ordinal * 600_000 + offset);
}

function ownershipMarker(input: {
  profile: B11Profile;
  namespace: string;
  scenarioKey: string;
  routeKey: string;
  preparedState: B11PreparedState;
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

function editEvents(
  count: number,
  doctor: UserDocument,
  ordinal: number,
): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  let previous: string | null = null;
  for (let index = 0; index < count; index += 1) {
    const next =
      index === count - 1
        ? CLINICIAN_OPINION
        : `B11 synthetic clinician value ${String(index + 1).padStart(3, '0')} with no clinical meaning.`;
    events.push({
      eventId: `b11-edit-${ordinal}-${index + 1}`,
      editedAt: routeDate(ordinal, (index + 1) * 1000),
      editedBy: doctor._id.toString(),
      editedByName: doctor.displayName,
      editedByRole: 'doctor',
      changedFields: ['doctorOpinion'],
      previousValues: { doctorOpinion: previous },
      nextValues: { doctorOpinion: next },
      editNote: 'B11 synthetic edit note with no clinical meaning.',
    });
    previous = next;
  }
  return events;
}

function lifecycleFor(state: B11PreparedState) {
  const mixed = state !== 'system_draft';
  const pending = state === 'pending_confirmation';
  const confirmed = ['confirmed', 'archived', 'corrected', 'voided'].includes(
    state,
  );
  return {
    mixed,
    submitted: pending || confirmed,
    confirmed,
  };
}

export class B11FixtureBuilder {
  constructor(
    private readonly profile: B11Profile,
    private readonly namespace: string,
    private readonly models: B11FixtureModels,
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
      throw new B11FixtureError(
        'B11_FIXTURE_CANONICAL_SEED_UNAVAILABLE',
        'Canonical MMSE readiness must exist before B11 roots are built',
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
    preparedState: B11PreparedState,
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
      displayName: `B11 synthetic subject ${String(ordinal).padStart(2, '0')}`,
      sourceType: ordinal % 2 === 0 ? 'research' : 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: ['batch-d', 'b11', this.profile, 'synthetic', 'deidentified'],
      notes: 'B11 synthetic subject note with no clinical meaning.',
      externalRefs: null,
      metadata: { b11Fixture: marker },
    });
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
      status: 'completed',
      assessmentDate: routeDate(ordinal),
      startedAt: routeDate(ordinal, 1000),
      completedAt: routeDate(ordinal, 2000),
      lockedAt: null,
      voidedAt: null,
      operatorSnapshot: {
        operatorId: doctor._id,
        operatorName: doctor.displayName,
        operatorRole: 'doctor',
      },
      clinicalContext: null,
      notes: 'B11 synthetic visit note with no clinical meaning.',
      metadata: { b11Fixture: marker },
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
        sourceDocument: 'B11 synthetic fixture source without item content',
      },
      startedAt: routeDate(ordinal, 1000),
      completedAt: routeDate(ordinal, 2000),
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
      notes: 'B11 synthetic execution root with no response content.',
      metadata: { b11Fixture: marker },
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
    preparedState: B11PreparedState;
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
    const lifecycle = lifecycleFor(input.preparedState);
    const auditCount =
      input.preparedState === 'audit_limit_draft'
        ? 200
        : lifecycle.mixed
          ? 1
          : 0;
    const events = editEvents(auditCount, input.doctor, input.ordinal);
    const submittedAt = routeDate(input.ordinal, 220_000);
    const confirmedAt = routeDate(input.ordinal, 240_000);
    const scoreResultId = new Types.ObjectId();
    const cognitiveDomainResultId = new Types.ObjectId();
    const metadata: Record<string, unknown> = {
      a20Generation: {
        version: 1,
        generationId: `b11-generation-${input.ordinal}`,
        generatedAt: routeDate(input.ordinal, 10_000),
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
      b11FixtureOwnership: {
        version: 1,
        profile: this.profile,
        namespace: this.namespace,
        scenarioKey: input.scenarioKey,
        routeKey: input.routeKey,
        preparedState: input.preparedState,
      },
    };
    if (events.length > 0) {
      const last = events[events.length - 1];
      metadata.a21Edits = {
        version: 1,
        events,
        lastEditedAt: last.editedAt,
        lastEditedBy: last.editedBy,
      };
    }
    if (lifecycle.submitted) {
      metadata.a21Submission = {
        version: 1,
        submissionId: `b11-submission-${input.ordinal}`,
        submittedAt,
        submittedBy: input.doctor._id.toString(),
        submittedByName: input.doctor.displayName,
        submittedByRole: 'doctor',
        submissionNote:
          'B11 synthetic submission note with no clinical meaning.',
      };
    }
    if (lifecycle.confirmed) {
      metadata.a21Confirmation = {
        version: 1,
        confirmationId: `b11-confirmation-${input.ordinal}`,
        confirmedAt,
        confirmedBy: input.doctor._id.toString(),
        confirmedByName: input.doctor.displayName,
        confirmedByRole: 'doctor',
        confirmationNote:
          'B11 synthetic confirmation note with no clinical meaning.',
      };
    }
    const archived =
      input.preparedState === 'archived' || input.preparedState === 'corrected';
    const corrected = input.preparedState === 'corrected';
    const voided = input.preparedState === 'voided';
    const lockedAt = archived ? routeDate(input.ordinal, 260_000) : null;
    const archivedAt = archived ? routeDate(input.ordinal, 280_000) : null;
    const correctedAt = corrected ? routeDate(input.ordinal, 300_000) : null;
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
      status:
        input.preparedState === 'system_draft' ||
        input.preparedState === 'mixed_draft' ||
        input.preparedState === 'audit_limit_draft'
          ? 'draft'
          : input.preparedState,
      reportVersion: 1,
      source: lifecycle.mixed ? 'mixed' : 'system_draft',
      patientSnapshot: {
        subjectCode: input.subjectCode,
        displayName: 'B11 synthetic subject display',
        sex: 'unknown',
        birthDate: null,
        educationYears: null,
      },
      visitSnapshot: {
        visitCode: input.visitCode,
        visitType: 'follow_up',
        assessmentDate: routeDate(input.ordinal),
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
          sourceDocument: 'B11 synthetic fixture trace without item content',
        },
      ],
      scoreSnapshots: [
        {
          scoreResultId,
          scaleCode: 'mmse',
          scaleName: 'B11 synthetic scale snapshot',
          scaleVersion: input.scaleVersion,
          totalScoreValue: 1,
          totalMaxScore: 1,
          totalMinScore: 0,
          scorePercent: 100,
          scoreStatus: 'confirmed',
          qualityStatus: 'passed',
          summary: 'B11 synthetic score summary with no clinical meaning.',
          scoreDetails: null,
        },
      ],
      domainSnapshots: [
        {
          cognitiveDomainResultId,
          scaleCode: 'mmse',
          domainCode: 'b11_synthetic_domain',
          domainTitle: 'B11 synthetic domain',
          scoreValue: 1,
          maxScore: 1,
          scorePercent: 100,
          weightedScore: 1,
          weightedMaxScore: 1,
          itemCount: 1,
          needsReviewItemCount: 0,
          summary: 'B11 synthetic domain summary with no clinical meaning.',
        },
      ],
      evidenceSnapshots: [],
      narrative: {
        ...SYSTEM_NARRATIVE,
        ...(lifecycle.mixed
          ? {
              doctorOpinion: CLINICIAN_OPINION,
              recommendationText: CLINICIAN_RECOMMENDATION,
            }
          : {}),
      },
      aiDraft: { status: 'not_requested', doctorEdited: false },
      confirmation: lifecycle.confirmed
        ? {
            confirmedAt,
            confirmedBy: input.doctor._id,
            confirmedByName: input.doctor.displayName,
            confirmedByRole: 'doctor',
            confirmationNote:
              'B11 synthetic confirmation note with no clinical meaning.',
          }
        : null,
      lockedAt,
      lockedBy: archived ? input.doctor._id : null,
      archivedAt,
      archivedBy: archived ? input.doctor._id : null,
      correctionRecords: corrected
        ? [
            {
              correctionNo: 1,
              correctedAt,
              correctedBy: input.doctor._id,
              correctedByName: input.doctor.displayName,
              reason:
                'B11 synthetic correction reason with no clinical meaning.',
              changeSummary:
                'B11 synthetic correction summary with no clinical meaning.',
              previousReportCode: reportCodeFor(
                this.profile,
                this.namespace,
                input.scenarioKey,
                input.routeKey,
              ),
              replacementReportCode: `${reportCodeFor(
                this.profile,
                this.namespace,
                input.scenarioKey,
                input.routeKey,
              )}-SYNTHETIC-REPLACEMENT`,
              auditLogId: null,
            },
          ]
        : [],
      voidedAt: voided ? routeDate(input.ordinal, 260_000) : null,
      voidedBy: voided ? input.doctor._id : null,
      voidReason: voided
        ? 'B11 synthetic void reason with no clinical meaning.'
        : undefined,
      auditLogRefs: [],
      qualityStatus: lifecycle.confirmed ? 'passed' : 'passed',
      qualityHints: null,
      operatorNote: 'B11 synthetic operator note with no clinical meaning.',
      metadata,
    };
  }
}
