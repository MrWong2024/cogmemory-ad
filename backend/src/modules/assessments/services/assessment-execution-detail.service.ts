import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PatientsService } from '../../patients/services/patients.service';
import { ScalesService } from '../../scales/services/scales.service';
import type { ScaleInstanceExecutionDetailResponse } from '../types/item-response-execution-response.types';
import { AssessmentsService } from './assessments.service';
import { toItemResponseExecutionResponse } from './item-response-execution.mapper';

@Injectable()
export class AssessmentExecutionDetailService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly scalesService: ScalesService,
  ) {}

  async getScaleInstanceExecutionDetail(
    patientId: string,
    visitId: string,
    scaleInstanceId: string,
  ): Promise<ScaleInstanceExecutionDetailResponse> {
    const patient = await this.patientsService.findPatientById(patientId);

    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
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

    const scaleInstance =
      await this.assessmentsService.findScaleInstanceByPatientVisitAndId(
        patientId,
        visitId,
        scaleInstanceId,
      );

    if (!scaleInstance) {
      throw new NotFoundException({
        code: 'SCALE_INSTANCE_NOT_FOUND',
        message: 'Scale instance not found',
      });
    }

    const [definition, version, itemResponses, progress] = await Promise.all([
      this.scalesService.findDefinitionByCode(scaleInstance.scaleCode),
      this.scalesService.findVersionByScaleCodeAndVersion(
        scaleInstance.scaleCode,
        scaleInstance.scaleVersion,
      ),
      this.assessmentsService.listItemResponsesByScaleInstanceId(
        scaleInstance.id,
      ),
      this.assessmentsService.countItemResponseProgress(scaleInstance.id),
    ]);

    if (
      !definition ||
      !version ||
      definition.id !== scaleInstance.scaleDefinitionId ||
      version.id !== scaleInstance.scaleVersionId ||
      version.scaleDefinitionId !== definition.id
    ) {
      throw new ConflictException({
        code: 'SCALE_INSTANCE_CONFIGURATION_UNAVAILABLE',
        message: 'Scale instance configuration is unavailable',
      });
    }

    return {
      visit: this.assessmentsService.toAssessmentVisitDetailResponse(visit),
      scale: {
        code: scaleInstance.scaleCode,
        name: definition.name,
        shortName: definition.shortName,
        version: scaleInstance.scaleVersion,
        displayVersion: version.displayVersion,
        crfVersion: version.crfVersion,
        sourceDocument: version.sourceDocument,
      },
      scaleInstance: this.assessmentsService.toPublicScaleInstanceResponse(
        scaleInstance,
        progress,
      ),
      groups: [...version.groups]
        .sort((left, right) => left.order - right.order)
        .map((group) => ({
          code: group.code,
          title: group.title,
          order: group.order,
          instruction: group.instruction,
          description: group.description,
          cognitiveDomainCodes: [...group.cognitiveDomainCodes],
        })),
      itemResponses: itemResponses.map(toItemResponseExecutionResponse),
    };
  }
}
