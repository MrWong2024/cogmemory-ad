import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ScaleInstanceExecutionParamDto } from '../../assessments/dto/scale-instance-execution-param.dto';
import type { PatientAdministrationSessionSummaryResponse } from '../../assessments/types/patient-administration-response.types';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { PatientAdministrationSessionHistoryParamDto } from '../dto/patient-administration-session-history-param.dto';
import { PatientAdministrationHistoryService } from '../services/patient-administration-history.service';

@Controller(
  'patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/patient-administration/sessions',
)
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class PatientAdministrationHistoryController {
  constructor(
    private readonly patientAdministrationHistoryService: PatientAdministrationHistoryService,
  ) {}

  @Get()
  listSessions(
    @Param() params: ScaleInstanceExecutionParamDto,
  ): Promise<PatientAdministrationSessionSummaryResponse[]> {
    return this.patientAdministrationHistoryService.listSessions(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
    );
  }

  @Delete(':sessionId')
  @HttpCode(204)
  async deleteSession(
    @Param() params: PatientAdministrationSessionHistoryParamDto,
  ): Promise<void> {
    await this.patientAdministrationHistoryService.deleteSession(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      params.sessionId,
    );
  }
}
