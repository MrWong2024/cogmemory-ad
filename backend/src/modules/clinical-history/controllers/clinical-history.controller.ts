import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { GetPatientFollowUpTrendQueryDto } from '../dto/get-patient-follow-up-trend-query.dto';
import { ListPatientAssessmentHistoryQueryDto } from '../dto/list-patient-assessment-history-query.dto';
import { PatientHistoryParamDto } from '../dto/patient-history-param.dto';
import { ClinicalHistoryQueryService } from '../services/clinical-history-query.service';
import type { PatientAssessmentHistoryResponse } from '../types/clinical-history.types';
import type { PatientFollowUpTrendResponse } from '../types/follow-up-trend.types';

@Controller('patients/:patientId')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class ClinicalHistoryController {
  constructor(private readonly queryService: ClinicalHistoryQueryService) {}

  @Get('assessment-history')
  list(
    @Param() params: PatientHistoryParamDto,
    @Query() query: ListPatientAssessmentHistoryQueryDto,
  ): Promise<PatientAssessmentHistoryResponse> {
    return this.queryService.listPatientAssessmentHistory(
      params.patientId,
      query,
    );
  }

  @Get('follow-up-trends')
  getFollowUpTrend(
    @Param() params: PatientHistoryParamDto,
    @Query() query: GetPatientFollowUpTrendQueryDto,
  ): Promise<PatientFollowUpTrendResponse> {
    return this.queryService.getPatientFollowUpTrend(params.patientId, query);
  }
}
