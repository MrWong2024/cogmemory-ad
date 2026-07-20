import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { AuthenticatedUserContext } from '../../../src/modules/auth/types/auth-user-context.type';
import type {
  AssessmentStatus,
  AssessmentVisitDocument,
  AssessmentVisitType,
} from '../../../src/modules/assessments/schemas/assessment-visit.schema';
import type { ItemResponseDocument } from '../../../src/modules/assessments/schemas/item-response.schema';
import type {
  ScaleAdministrationMode,
  ScaleInstanceDocument,
} from '../../../src/modules/assessments/schemas/scale-instance.schema';
import type { AssessmentScaleWorkflowService } from '../../../src/modules/assessments/services/assessment-scale-workflow.service';
import type { PatientDocument } from '../../../src/modules/patients/schemas/patient.schema';
import type { ScaleCatalogService } from '../../../src/modules/scales/services/scale-catalog.service';
import {
  B123_BUSINESS_SCENARIOS,
  B123FixtureError,
  browserPatientSubjectCodeFor,
  scenarioSubjectCodeFor,
  scenarioVisitCodeFor,
  type B123BusinessScenarioKey,
  type B123ScenarioDefinition,
} from './fixture-contract';

export const B123_PATIENT_DEFAULT_PAGE_SIZE = 20;
export const B123_PATIENT_LIST_EXTRA_COUNT = B123_PATIENT_DEFAULT_PAGE_SIZE + 3;
export const B123_MMSE_ITEM_COUNT = 11;
export const B123_MOCA_ITEM_COUNT = 16;

export type B123FixtureModels = {
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  scaleInstances: Model<ScaleInstanceDocument>;
  itemResponses: Model<ItemResponseDocument>;
};

export type B123ScenarioRoot = {
  scenarioKey: B123BusinessScenarioKey;
  ordinal: number;
  patientId: Types.ObjectId;
  subjectCode: string;
};

export type B123VisitRoot = B123ScenarioRoot & {
  visitId: Types.ObjectId;
  visitCode: string;
};

const BASE_DATE = new Date('2026-07-01T08:00:00.000Z');

export function b123BusinessPatientDefinitions(): readonly B123ScenarioDefinition[] {
  return B123_BUSINESS_SCENARIOS.filter(
    (definition) => definition.ordinal >= 6,
  );
}

export function listExtraSubjectCodeFor(
  namespace: string,
  index: number,
): string {
  return scenarioSubjectCodeFor(
    namespace,
    7,
    `PAGE-${index.toString().padStart(2, '0')}`,
  );
}

export function archivedPatientSubjectCodeFor(namespace: string): string {
  return scenarioSubjectCodeFor(namespace, 13, 'ARCHIVED');
}

export function crossOwnedPatientSubjectCodeFor(namespace: string): string {
  return scenarioSubjectCodeFor(namespace, 23, 'OTHER-OWNER');
}

export function ownedSubjectCodesFor(namespace: string): string[] {
  return [
    ...b123BusinessPatientDefinitions().map((definition) =>
      scenarioSubjectCodeFor(namespace, definition.ordinal),
    ),
    ...Array.from({ length: B123_PATIENT_LIST_EXTRA_COUNT }, (_, index) =>
      listExtraSubjectCodeFor(namespace, index + 1),
    ),
    archivedPatientSubjectCodeFor(namespace),
    crossOwnedPatientSubjectCodeFor(namespace),
    browserPatientSubjectCodeFor(namespace),
  ];
}

export function expectedPreparedPatientCount(): number {
  return (
    b123BusinessPatientDefinitions().length + B123_PATIENT_LIST_EXTRA_COUNT + 2
  );
}

function fixtureFailure(
  scenarioKey: B123BusinessScenarioKey,
  safeMessage: string,
): B123FixtureError {
  return new B123FixtureError(
    'B123_FIXTURE_SCENARIO_INVALID',
    safeMessage,
    scenarioKey,
  );
}

export class B123ScenarioBuilder {
  constructor(
    private readonly namespace: string,
    private readonly models: B123FixtureModels,
    private readonly scaleCatalogService: ScaleCatalogService,
    private readonly scaleWorkflow: AssessmentScaleWorkflowService,
  ) {}

  async buildAll(actor: AuthenticatedUserContext): Promise<void> {
    await Promise.all([
      this.scaleCatalogService.ensureSeedScaleVersionMaterialized('mmse'),
      this.scaleCatalogService.ensureSeedScaleVersionMaterialized('moca'),
    ]);

    for (const definition of b123BusinessPatientDefinitions()) {
      const root = await this.createPatient(definition);
      await this.buildScenario(root, actor);
    }
  }

  private async buildScenario(
    root: B123ScenarioRoot,
    actor: AuthenticatedUserContext,
  ): Promise<void> {
    switch (root.scenarioKey) {
      case 'patients_list_matrix':
        await this.buildPatientListMatrix();
        return;
      case 'patient_detail_active':
        await this.buildPatientDetailVisits(root);
        return;
      case 'visit_create_matrix':
        await this.createVisit(root, 'TARGET', 'draft', 'follow_up');
        return;
      case 'visit_duplicate_conflict':
        await this.createVisit(root, 'DUPLICATE', 'draft', 'baseline');
        return;
      case 'patient_status_matrix':
        await this.buildPatientStatusMatrix(root);
        return;
      case 'visit_list_failure_isolated':
        await this.createVisit(root, 'VISIBLE', 'draft', 'screening');
        return;
      case 'visit_detail_uninitialized':
      case 'scale_initialization_matrix':
      case 'visit_authz_matrix':
      case 'catalog_error_matrix':
      case 'scale_unavailable':
      case 'visit_request_boundary':
        await this.createVisit(
          root,
          'BASE',
          root.scenarioKey === 'scale_initialization_matrix'
            ? 'in_progress'
            : 'draft',
          'baseline',
        );
        return;
      case 'scale_duplicate_conflict': {
        const visit = await this.createVisit(
          root,
          'BASE',
          'in_progress',
          'follow_up',
        );
        await this.initialize(visit, actor, 'mmse', 'clinician_administered');
        await this.initialize(visit, actor, 'moca', 'supervised_patient_input');
        return;
      }
      case 'visit_read_only_status_matrix':
        await Promise.all([
          this.createVisit(root, 'COMPLETED', 'completed', 'baseline'),
          this.createVisit(root, 'LOCKED', 'locked', 'follow_up'),
          this.createVisit(root, 'VOIDED', 'voided', 'screening'),
        ]);
        return;
      case 'visit_not_found_matrix':
        await this.buildOwnershipMismatch(root);
        return;
      default:
        return;
    }
  }

  private async createPatient(
    definition: B123ScenarioDefinition,
  ): Promise<B123ScenarioRoot> {
    const subjectCode = scenarioSubjectCodeFor(
      this.namespace,
      definition.ordinal,
    );
    const patient = await this.models.patients.create({
      subjectCode,
      displayName: `B1-B3 脱敏受试者 ${definition.ordinal}`,
      sourceType: definition.ordinal % 2 === 0 ? 'research' : 'clinical',
      sex: 'unknown',
      birthDate: new Date(
        Date.UTC(1940 + (definition.ordinal % 50), definition.ordinal % 12, 1),
      ),
      educationYears: 9 + (definition.ordinal % 7),
      handedness: definition.ordinal % 2 === 0 ? 'right' : 'unknown',
      status: 'active',
      tags: [`batch-a-${definition.ordinal % 3}`, 'synthetic'],
      notes: 'Synthetic B1-B3 browser fixture only',
      externalRefs: null,
      metadata: null,
    });
    return {
      scenarioKey: definition.scenarioKey,
      ordinal: definition.ordinal,
      patientId: patient._id,
      subjectCode,
    };
  }

  private async buildPatientListMatrix(): Promise<void> {
    const patients = Array.from(
      { length: B123_PATIENT_LIST_EXTRA_COUNT },
      (_, index) => {
        const row = index + 1;
        return {
          subjectCode: listExtraSubjectCodeFor(this.namespace, row),
          displayName: `B1-B3 分页脱敏受试者 ${row.toString().padStart(2, '0')}`,
          sourceType: row % 2 === 0 ? 'research' : 'clinical',
          sex: row % 3 === 0 ? 'female' : 'unknown',
          birthDate: new Date(Date.UTC(1950 + row, row % 12, 2)),
          educationYears: 6 + (row % 13),
          handedness: row % 2 === 0 ? 'right' : 'left',
          status:
            row % 11 === 0 ? 'archived' : row % 7 === 0 ? 'inactive' : 'active',
          tags: [row % 2 === 0 ? '偶数标签' : '奇数标签', '分页矩阵'],
          notes: 'Synthetic pagination row',
          externalRefs: null,
          metadata: null,
        };
      },
    );
    await this.models.patients.insertMany(patients);
  }

  private async buildPatientDetailVisits(
    root: B123ScenarioRoot,
  ): Promise<void> {
    await Promise.all([
      this.createVisit(root, 'DRAFT', 'draft', 'baseline', 0),
      this.createVisit(root, 'PROGRESS', 'in_progress', 'follow_up', 1),
      this.createVisit(root, 'COMPLETED', 'completed', 'screening', 2),
      this.createVisit(root, 'LOCKED', 'locked', 'unscheduled', 3),
      this.createVisit(root, 'VOIDED', 'voided', 'other', 4),
    ]);
  }

  private async buildPatientStatusMatrix(
    root: B123ScenarioRoot,
  ): Promise<void> {
    await this.models.patients
      .updateOne({ _id: root.patientId }, { $set: { status: 'inactive' } })
      .exec();
    await this.models.patients.create({
      subjectCode: archivedPatientSubjectCodeFor(this.namespace),
      displayName: 'B1-B3 脱敏归档受试者',
      sourceType: 'clinical',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'archived',
      tags: ['synthetic'],
      notes: 'Synthetic archived write-boundary root',
      externalRefs: null,
      metadata: null,
    });
  }

  private async buildOwnershipMismatch(root: B123ScenarioRoot): Promise<void> {
    const otherPatient = await this.models.patients.create({
      subjectCode: crossOwnedPatientSubjectCodeFor(this.namespace),
      displayName: 'B1-B3 脱敏跨归属受试者',
      sourceType: 'research',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: ['synthetic'],
      notes: 'Synthetic ownership boundary root',
      externalRefs: null,
      metadata: null,
    });
    await this.createVisit(
      {
        ...root,
        patientId: otherPatient._id,
        subjectCode: otherPatient.subjectCode,
      },
      'OTHER-OWNER',
      'draft',
      'baseline',
    );
  }

  private async createVisit(
    root: B123ScenarioRoot,
    suffix: string,
    status: AssessmentStatus,
    visitType: AssessmentVisitType,
    dayOffset = 0,
  ): Promise<B123VisitRoot> {
    const assessmentDate = new Date(
      BASE_DATE.getTime() + dayOffset * 24 * 60 * 60 * 1000,
    );
    const visitCode = scenarioVisitCodeFor(
      this.namespace,
      root.ordinal,
      suffix,
    );
    const visit = await this.models.visits.create({
      patientId: root.patientId,
      subjectCode: root.subjectCode,
      visitCode,
      visitType,
      status,
      assessmentDate,
      startedAt: status === 'draft' ? null : assessmentDate,
      completedAt: ['completed', 'locked'].includes(status)
        ? assessmentDate
        : null,
      lockedAt: status === 'locked' ? assessmentDate : null,
      voidedAt: status === 'voided' ? assessmentDate : null,
      operatorSnapshot: null,
      clinicalContext: null,
      notes: `Synthetic ${suffix.toLowerCase()} Visit`,
      metadata: null,
    });
    return { ...root, visitId: visit._id, visitCode };
  }

  private async initialize(
    root: B123VisitRoot,
    actor: AuthenticatedUserContext,
    scaleCode: 'mmse' | 'moca',
    administrationMode: ScaleAdministrationMode,
  ): Promise<void> {
    if (actor.userType !== 'doctor') {
      throw fixtureFailure(
        root.scenarioKey,
        'Fixture operator role is invalid',
      );
    }
    await this.scaleWorkflow.initializeScaleInstance(
      root.patientId.toString(),
      root.visitId.toString(),
      { scaleCode, administrationMode },
      {
        operatorId: actor.id,
        operatorName: actor.displayName,
        operatorRole: 'doctor',
      },
    );
  }
}
