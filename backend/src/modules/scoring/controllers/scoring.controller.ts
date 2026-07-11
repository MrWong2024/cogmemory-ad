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
import { ScaleInstanceExecutionParamDto } from '../../assessments/dto/scale-instance-execution-param.dto';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { ComputeScoreResultDto } from '../dto/compute-score-result.dto';
import { ConfirmScoreResultDto } from '../dto/confirm-score-result.dto';
import { ReviewScoreItemDto } from '../dto/review-score-item.dto';
import { ScoreItemReviewParamDto } from '../dto/score-item-review-param.dto';
import { ScoreResultParamDto } from '../dto/score-result-param.dto';
import { ProvisionalScoringWorkflowService } from '../services/provisional-scoring-workflow.service';
import { ScoreReviewWorkflowService } from '../services/score-review-workflow.service';
import type {
  ConfirmScoreResultResponse,
  ComputeScoreResultResponse,
  ReviewScoreItemResponse,
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
    private readonly scoreReviewWorkflowService: ScoreReviewWorkflowService,
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

  @Patch(':scoreResultId/item-scores/:itemResponseId/manual-review')
  reviewScoreItem(
    @Param() params: ScoreItemReviewParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: ReviewScoreItemDto,
  ): Promise<ReviewScoreItemResponse> {
    return this.scoreReviewWorkflowService.reviewScoreItem(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      params.scoreResultId,
      params.itemResponseId,
      currentUser,
      input,
    );
  }

  @Post(':scoreResultId/confirm')
  @HttpCode(HttpStatus.OK)
  confirmScoreResult(
    @Param() params: ScoreResultParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: ConfirmScoreResultDto,
  ): Promise<ConfirmScoreResultResponse> {
    return this.scoreReviewWorkflowService.confirmScoreResult(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      params.scoreResultId,
      currentUser,
      input,
    );
  }
}
