import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { ScaleCatalogService } from '../services/scale-catalog.service';
import type { AvailableScaleListResponse } from '../types/scale-catalog-response.types';

@Controller('scales')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class ScalesController {
  constructor(private readonly scaleCatalogService: ScaleCatalogService) {}

  @Get('available')
  getAvailableScales(): AvailableScaleListResponse {
    return {
      items: this.scaleCatalogService.listAvailableScaleOptions(),
    };
  }
}
