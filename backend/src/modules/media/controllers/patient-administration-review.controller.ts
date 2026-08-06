import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { ScaleInstanceExecutionParamDto } from '../../assessments/dto/scale-instance-execution-param.dto';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { PatientAdministrationReviewService } from '../services/patient-administration-review.service';
import type { PatientAdministrationReviewResponse } from '../types/patient-administration-review-response.types';

@Controller(
  'patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/patient-administration/review',
)
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class PatientAdministrationReviewController {
  constructor(
    private readonly patientAdministrationReviewService: PatientAdministrationReviewService,
  ) {}

  @Get()
  getReview(
    @Param() params: ScaleInstanceExecutionParamDto,
  ): Promise<PatientAdministrationReviewResponse> {
    return this.patientAdministrationReviewService.getReview(params);
  }
}
