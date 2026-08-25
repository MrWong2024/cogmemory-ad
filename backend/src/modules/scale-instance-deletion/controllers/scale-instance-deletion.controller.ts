import { Controller, Delete, HttpCode, Param, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { ScaleInstanceExecutionParamDto } from '../../assessments/dto/scale-instance-execution-param.dto';
import { ScaleInstanceDeletionService } from '../services/scale-instance-deletion.service';

@Controller('patients/:patientId/visits/:visitId/scale-instances')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class ScaleInstanceDeletionController {
  constructor(
    private readonly scaleInstanceDeletionService: ScaleInstanceDeletionService,
  ) {}

  @Delete(':scaleInstanceId')
  @HttpCode(204)
  async deleteScaleInstance(
    @Param() params: ScaleInstanceExecutionParamDto,
  ): Promise<void> {
    await this.scaleInstanceDeletionService.deleteScaleInstance(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
    );
  }
}
