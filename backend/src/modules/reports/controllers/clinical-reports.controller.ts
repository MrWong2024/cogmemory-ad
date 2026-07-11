import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { ClinicalReportVisitParamDto } from '../dto/clinical-report-visit-param.dto';
import { GenerateClinicalReportDto } from '../dto/generate-clinical-report.dto';
import { ClinicalReportGenerationWorkflowService } from '../services/clinical-report-generation-workflow.service';
import type {
  ClinicalReportDetailResponse,
  GenerateClinicalReportResponse,
} from '../types/clinical-report-response.types';

@Controller('patients/:patientId/visits/:visitId/clinical-reports')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class ClinicalReportsController {
  constructor(
    private readonly workflow: ClinicalReportGenerationWorkflowService,
  ) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  generate(
    @Param() params: ClinicalReportVisitParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: GenerateClinicalReportDto,
  ): Promise<GenerateClinicalReportResponse> {
    return this.workflow.generateClinicalReportDraft(
      params.patientId,
      params.visitId,
      currentUser,
      input,
    );
  }

  @Get('latest')
  latest(
    @Param() params: ClinicalReportVisitParamDto,
  ): Promise<ClinicalReportDetailResponse> {
    return this.workflow.getLatestClinicalReport(
      params.patientId,
      params.visitId,
    );
  }
}
