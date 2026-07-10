import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Param,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { CreateAssessmentVisitDto } from '../dto/create-assessment-visit.dto';
import { ListAssessmentVisitsQueryDto } from '../dto/list-assessment-visits-query.dto';
import { PatientVisitsParamDto } from '../dto/patient-visits-param.dto';
import type { AssessmentOperatorRole } from '../schemas/assessment-visit.schema';
import {
  AssessmentsService,
  type CreateVisitOperatorSnapshot,
} from '../services/assessments.service';
import type {
  AssessmentVisitDetailResponse,
  AssessmentVisitListResponse,
} from '../types/assessment-visit-response.types';

const OPERATOR_ROLE_PRIORITY: AssessmentOperatorRole[] = [
  'doctor',
  'nurse',
  'research_assistant',
  'admin',
];

@Controller('patients/:patientId/visits')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class AssessmentVisitsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get()
  listVisits(
    @Param() params: PatientVisitsParamDto,
    @Query() query: ListAssessmentVisitsQueryDto,
  ): Promise<AssessmentVisitListResponse> {
    return this.assessmentsService.listVisitsByPatientIdPaginated(
      params.patientId,
      query,
    );
  }

  @Post()
  createVisit(
    @Param() params: PatientVisitsParamDto,
    @Body() createAssessmentVisitDto: CreateAssessmentVisitDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
  ): Promise<AssessmentVisitDetailResponse> {
    return this.assessmentsService.createVisitForPatient(params.patientId, {
      ...createAssessmentVisitDto,
      operatorSnapshot: this.buildOperatorSnapshot(currentUser),
    });
  }

  private buildOperatorSnapshot(
    currentUser: AuthenticatedUserContext | undefined,
  ): CreateVisitOperatorSnapshot {
    if (!currentUser) {
      throw new UnauthorizedException();
    }

    return {
      operatorId: currentUser.id,
      operatorName: currentUser.displayName,
      operatorRole:
        OPERATOR_ROLE_PRIORITY.find((role) =>
          currentUser.roles.includes(role),
        ) ?? 'unknown',
    };
  }
}
