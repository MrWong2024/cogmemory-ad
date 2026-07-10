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
import { ScaleInstanceExecutionParamDto } from '../dto/scale-instance-execution-param.dto';
import { SubmitScaleInstanceDto } from '../dto/submit-scale-instance.dto';
import { ScaleInstanceSubmissionService } from '../services/scale-instance-submission.service';
import type {
  ScaleSubmissionReadinessResponse,
  SubmitScaleInstanceResponse,
} from '../types/scale-instance-submission-response.types';

@Controller('patients/:patientId/visits/:visitId/scale-instances')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class ScaleInstanceSubmissionController {
  constructor(
    private readonly scaleInstanceSubmissionService: ScaleInstanceSubmissionService,
  ) {}

  @Get(':scaleInstanceId/submission-readiness')
  getSubmissionReadiness(
    @Param() params: ScaleInstanceExecutionParamDto,
  ): Promise<ScaleSubmissionReadinessResponse> {
    return this.scaleInstanceSubmissionService.getSubmissionReadiness(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
    );
  }

  @Post(':scaleInstanceId/submit')
  @HttpCode(HttpStatus.OK)
  submitScaleInstance(
    @Param() params: ScaleInstanceExecutionParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: SubmitScaleInstanceDto,
  ): Promise<SubmitScaleInstanceResponse> {
    return this.scaleInstanceSubmissionService.submitScaleInstance(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      currentUser,
      input,
    );
  }
}
