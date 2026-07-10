import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { ItemResponseDraftParamDto } from '../dto/item-response-draft-param.dto';
import { ScaleInstanceExecutionParamDto } from '../dto/scale-instance-execution-param.dto';
import { UpdateItemResponseDraftDto } from '../dto/update-item-response-draft.dto';
import { AssessmentExecutionDetailService } from '../services/assessment-execution-detail.service';
import { ItemResponseDraftService } from '../services/item-response-draft.service';
import type {
  ScaleInstanceExecutionDetailResponse,
  UpdateItemResponseDraftResponse,
} from '../types/item-response-execution-response.types';

@Controller('patients/:patientId/visits/:visitId/scale-instances')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class AssessmentExecutionController {
  constructor(
    private readonly assessmentExecutionDetailService: AssessmentExecutionDetailService,
    private readonly itemResponseDraftService: ItemResponseDraftService,
  ) {}

  @Get(':scaleInstanceId')
  getScaleInstanceExecutionDetail(
    @Param() params: ScaleInstanceExecutionParamDto,
  ): Promise<ScaleInstanceExecutionDetailResponse> {
    return this.assessmentExecutionDetailService.getScaleInstanceExecutionDetail(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
    );
  }

  @Patch(':scaleInstanceId/item-responses/:itemResponseId')
  saveItemResponseDraft(
    @Param() params: ItemResponseDraftParamDto,
    @Body() input: UpdateItemResponseDraftDto,
  ): Promise<UpdateItemResponseDraftResponse> {
    return this.itemResponseDraftService.saveDraft(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      params.itemResponseId,
      input,
    );
  }
}
