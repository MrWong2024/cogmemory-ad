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
import { ScaleInstanceExecutionParamDto } from '../../assessments/dto/scale-instance-execution-param.dto';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { ComputeCognitiveDomainResultDto } from '../dto/compute-cognitive-domain-result.dto';
import { CognitiveDomainComputationWorkflowService } from '../services/cognitive-domain-computation-workflow.service';
import type {
  CognitiveDomainResultDetailResponse,
  ComputeCognitiveDomainResultResponse,
} from '../types/cognitive-domain-result-response.types';

@Controller(
  'patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/cognitive-domain-results',
)
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class CognitiveDomainResultsController {
  constructor(
    private readonly workflow: CognitiveDomainComputationWorkflowService,
  ) {}

  @Post('compute')
  @HttpCode(HttpStatus.OK)
  computeDomainResult(
    @Param() params: ScaleInstanceExecutionParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: ComputeCognitiveDomainResultDto,
  ): Promise<ComputeCognitiveDomainResultResponse> {
    return this.workflow.computeDomainResult(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      currentUser,
      input,
    );
  }

  @Get('latest')
  getLatestDomainResult(
    @Param() params: ScaleInstanceExecutionParamDto,
  ): Promise<CognitiveDomainResultDetailResponse> {
    return this.workflow.getLatestDomainResult(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
    );
  }
}
