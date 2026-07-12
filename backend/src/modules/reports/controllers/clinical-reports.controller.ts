import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { ClinicalReportResourceParamDto } from '../dto/clinical-report-resource-param.dto';
import { ConfirmClinicalReportDto } from '../dto/confirm-clinical-report.dto';
import { GenerateClinicalReportDto } from '../dto/generate-clinical-report.dto';
import { SubmitClinicalReportForConfirmationDto } from '../dto/submit-clinical-report-for-confirmation.dto';
import { UpdateClinicalReportDraftDto } from '../dto/update-clinical-report-draft.dto';
import { ClinicalReportGenerationWorkflowService } from '../services/clinical-report-generation-workflow.service';
import { ClinicalReportReviewWorkflowService } from '../services/clinical-report-review-workflow.service';
import type {
  ConfirmClinicalReportResponse,
  ClinicalReportDetailResponse,
  GenerateClinicalReportResponse,
  SubmitClinicalReportForConfirmationResponse,
  UpdateClinicalReportDraftResponse,
} from '../types/clinical-report-response.types';

@Controller('patients/:patientId/visits/:visitId/clinical-reports')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class ClinicalReportsController {
  constructor(
    private readonly workflow: ClinicalReportGenerationWorkflowService,
    private readonly reviewWorkflow: ClinicalReportReviewWorkflowService,
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

  @Patch(':reportId/draft')
  @HttpCode(HttpStatus.OK)
  updateDraft(
    @Param() params: ClinicalReportResourceParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: UpdateClinicalReportDraftDto,
  ): Promise<UpdateClinicalReportDraftResponse> {
    return this.reviewWorkflow.updateDraft(
      params.patientId,
      params.visitId,
      params.reportId,
      currentUser,
      input,
    );
  }

  @Post(':reportId/submit-confirmation')
  @HttpCode(HttpStatus.OK)
  submitForConfirmation(
    @Param() params: ClinicalReportResourceParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: SubmitClinicalReportForConfirmationDto,
  ): Promise<SubmitClinicalReportForConfirmationResponse> {
    return this.reviewWorkflow.submitForConfirmation(
      params.patientId,
      params.visitId,
      params.reportId,
      currentUser,
      input,
    );
  }

  @Post(':reportId/confirm')
  @HttpCode(HttpStatus.OK)
  @Roles('doctor', 'admin')
  confirmReport(
    @Param() params: ClinicalReportResourceParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: ConfirmClinicalReportDto,
  ): Promise<ConfirmClinicalReportResponse> {
    return this.reviewWorkflow.confirmReport(
      params.patientId,
      params.visitId,
      params.reportId,
      currentUser,
      input,
    );
  }
}
