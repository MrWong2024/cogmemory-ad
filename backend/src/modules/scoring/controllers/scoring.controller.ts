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
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { ScaleInstanceExecutionParamDto } from '../../assessments/dto/scale-instance-execution-param.dto';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { ComputeScoreResultDto } from '../dto/compute-score-result.dto';
import { ProvisionalScoringWorkflowService } from '../services/provisional-scoring-workflow.service';
import type {
  ComputeScoreResultResponse,
  ScoreResultDetailResponse,
} from '../types/score-result-response.types';

@Controller(
  'patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/score-results',
)
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class ScoringController {
  constructor(
    private readonly provisionalScoringWorkflowService: ProvisionalScoringWorkflowService,
  ) {}

  @Post('compute')
  @HttpCode(HttpStatus.OK)
  computeScoreResult(
    @Param() params: ScaleInstanceExecutionParamDto,
    @Body() input: ComputeScoreResultDto,
  ): Promise<ComputeScoreResultResponse> {
    return this.provisionalScoringWorkflowService.computeScoreResult(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      input,
    );
  }

  @Get('latest')
  getLatestScoreResult(
    @Param() params: ScaleInstanceExecutionParamDto,
  ): Promise<ScoreResultDetailResponse> {
    return this.provisionalScoringWorkflowService.getLatestScoreResult(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
    );
  }
}
