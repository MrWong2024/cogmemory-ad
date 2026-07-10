import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { InitializeScaleInstanceDto } from '../dto/initialize-scale-instance.dto';
import type { AssessmentOperatorRole } from '../schemas/assessment-visit.schema';
import { PatientsService } from '../../patients/services/patients.service';
import { ScaleCatalogService } from '../../scales/services/scale-catalog.service';
import type { InitializeScaleInstanceResponse } from '../types/assessment-execution-response.types';
import { AssessmentExecutionService } from './assessment-execution.service';
import { AssessmentsService } from './assessments.service';

export type InitializeScaleInstanceOperatorSnapshot = {
  operatorId: string;
  operatorName: string;
  operatorRole: AssessmentOperatorRole;
};

type MongoDuplicateKeyError = {
  code: number;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toMongoDuplicateKeyError(
  error: unknown,
): MongoDuplicateKeyError | null {
  if (!isRecord(error) || error.code !== 11000) {
    return null;
  }

  return {
    code: 11000,
    keyPattern: isRecord(error.keyPattern) ? error.keyPattern : undefined,
    keyValue: isRecord(error.keyValue) ? error.keyValue : undefined,
  };
}

function hasScaleInstanceUniqueKey(
  key: Record<string, unknown> | undefined,
): boolean {
  if (!key) {
    return false;
  }

  return (
    'instanceCode' in key ||
    ('assessmentVisitId' in key && 'scaleCode' in key && 'instanceNo' in key)
  );
}

@Injectable()
export class AssessmentScaleWorkflowService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly scaleCatalogService: ScaleCatalogService,
    private readonly assessmentExecutionService: AssessmentExecutionService,
  ) {}

  async initializeScaleInstance(
    patientId: string,
    visitId: string,
    input: InitializeScaleInstanceDto,
    operatorSnapshot: InitializeScaleInstanceOperatorSnapshot,
  ): Promise<InitializeScaleInstanceResponse> {
    const patient = await this.patientsService.findPatientById(patientId);

    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      });
    }

    if (patient.status !== 'active') {
      throw new ConflictException({
        code: 'PATIENT_NOT_ACTIVE',
        message: 'Patient is not active',
      });
    }

    const visit = await this.assessmentsService.findVisitByPatientAndId(
      patientId,
      visitId,
    );

    if (!visit) {
      throw new NotFoundException({
        code: 'VISIT_NOT_FOUND',
        message: 'Assessment visit not found',
      });
    }

    if (visit.status !== 'draft' && visit.status !== 'in_progress') {
      throw new ConflictException({
        code: 'VISIT_NOT_INITIALIZABLE',
        message: 'Assessment visit cannot initialize a scale instance',
      });
    }

    const availableScale = this.scaleCatalogService.getAvailableScaleOption(
      input.scaleCode,
      input.scaleVersion,
    );
    const existingScaleInstance =
      await this.assessmentsService.findScaleInstanceByVisitAndScaleCode(
        visitId,
        availableScale.code,
      );

    if (existingScaleInstance) {
      this.throwScaleInstanceAlreadyExists();
    }

    const materializedScale =
      await this.scaleCatalogService.ensureSeedScaleVersionMaterialized(
        availableScale.code,
        availableScale.version,
      );
    const instanceCode = `INST-${visitId.toUpperCase()}-${availableScale.code.toUpperCase()}-1`;

    try {
      const creationResult =
        await this.assessmentExecutionService.createScaleExecutionFromSeed({
          patientId,
          assessmentVisitId: visitId,
          subjectCode: patient.subjectCode,
          scaleDefinitionId: materializedScale.scaleDefinitionId,
          scaleVersionId: materializedScale.scaleVersionId,
          scaleCode: materializedScale.scaleCode,
          scaleVersion: materializedScale.version,
          instanceCode,
          instanceNo: 1,
          administrationMode:
            input.administrationMode ?? 'clinician_administered',
          operatorSnapshot,
          startedAt: null,
          metadata: null,
        });

      return {
        scale: {
          code: materializedScale.option.code,
          name: materializedScale.option.name,
          shortName: materializedScale.option.shortName,
          version: materializedScale.option.version,
          displayVersion: materializedScale.option.displayVersion,
        },
        scaleInstance: this.assessmentsService.toPublicScaleInstanceResponse(
          creationResult.scaleInstance,
        ),
        createdItemResponseCount: creationResult.createdItemResponseCount,
      };
    } catch (error: unknown) {
      if (this.isScaleInstanceDuplicateKeyError(error)) {
        this.throwScaleInstanceAlreadyExists();
      }

      throw new InternalServerErrorException({
        code: 'SCALE_EXECUTION_INITIALIZATION_FAILED',
        message: 'Scale execution initialization failed',
      });
    }
  }

  private isScaleInstanceDuplicateKeyError(error: unknown): boolean {
    const duplicateKeyError = toMongoDuplicateKeyError(error);

    return Boolean(
      duplicateKeyError &&
      (hasScaleInstanceUniqueKey(duplicateKeyError.keyPattern) ||
        hasScaleInstanceUniqueKey(duplicateKeyError.keyValue)),
    );
  }

  private throwScaleInstanceAlreadyExists(): never {
    throw new ConflictException({
      code: 'SCALE_INSTANCE_ALREADY_EXISTS',
      message: 'Scale instance already exists for this assessment visit',
    });
  }
}
