import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { ListPatientAssessmentHistoryQueryDto } from '../dto/list-patient-assessment-history-query.dto';
import { PatientHistoryParamDto } from '../dto/patient-history-param.dto';
import { ClinicalHistoryQueryService } from '../services/clinical-history-query.service';
import type { PatientAssessmentHistoryResponse } from '../types/clinical-history.types';

@Controller('patients/:patientId/assessment-history')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class ClinicalHistoryController {
  constructor(private readonly queryService: ClinicalHistoryQueryService) {}

  @Get()
  list(
    @Param() params: PatientHistoryParamDto,
    @Query() query: ListPatientAssessmentHistoryQueryDto,
  ): Promise<PatientAssessmentHistoryResponse> {
    return this.queryService.listPatientAssessmentHistory(
      params.patientId,
      query,
    );
  }
}
