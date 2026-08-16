import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { AuthService } from '../../auth/services/auth.service';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import {
  buildClearSessionCookieOptions,
  readSessionTokenFromRequest,
} from '../../auth/utils/session-cookie.util';
import type {
  CookieLikeRequest,
  SessionCookieResponse,
} from '../../auth/utils/session-cookie.util';
import { SESSION_COOKIE_NAME } from '../../auth/auth.constants';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import {
  CompletePatientAdministrationStaffStepDto,
  ConfirmPatientAdministrationPreparationDto,
  CreatePatientAdministrationSessionDto,
  PatientAdministrationControlDto,
  PatientAdministrationRequiredReasonDto,
  PatientAdministrationRevisionDto,
  PatientAdministrationStaffAssetParamDto,
  TakeOverPatientAdministrationStepDto,
} from '../dto/patient-administration.dto';
import { ScaleInstanceExecutionParamDto } from '../dto/scale-instance-execution-param.dto';
import { PATIENT_ADMINISTRATION_COOKIE_NAME } from '../patient-administration.constants';
import { PatientAdministrationSessionService } from '../services/patient-administration-session.service';
import type {
  PatientAdministrationEntryCodeResponse,
  PatientAdministrationSessionCreateResponse,
  PatientAdministrationSessionSummaryResponse,
} from '../types/patient-administration-response.types';
import { buildPatientAdministrationCookieOptions } from '../utils/patient-administration-cookie.util';

@Controller(
  'patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/patient-administration',
)
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class PatientAdministrationStaffController {
  constructor(
    private readonly patientAdministrationSessionService: PatientAdministrationSessionService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  createSession(
    @Param() params: ScaleInstanceExecutionParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: CreatePatientAdministrationSessionDto,
  ): Promise<PatientAdministrationSessionCreateResponse> {
    return this.patientAdministrationSessionService.createSession(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      input.deviceMode,
      this.patientAdministrationSessionService.buildOperatorSnapshot(
        currentUser,
      ),
    );
  }

  @Get()
  getLatestSession(
    @Param() params: ScaleInstanceExecutionParamDto,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    return this.patientAdministrationSessionService.getLatestSession(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
    );
  }

  @Post('handoff')
  @HttpCode(HttpStatus.OK)
  async handoff(
    @Param() params: ScaleInstanceExecutionParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: PatientAdministrationRevisionDto,
    @Req() request: CookieLikeRequest,
    @Res({ passthrough: true }) response: SessionCookieResponse,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    const operator =
      this.patientAdministrationSessionService.buildOperatorSnapshot(
        currentUser,
      );
    await this.patientAdministrationSessionService.validateSameDeviceHandoff(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      input.expectedRevision,
    );

    const rawStaffToken = readSessionTokenFromRequest(request);
    if (
      !rawStaffToken ||
      !(await this.authService.revokeSessionByToken(rawStaffToken))
    ) {
      throw new UnauthorizedException();
    }

    const secure = this.configService.getOrThrow<boolean>(
      'session.cookieSecure',
    );
    response.clearCookie(
      SESSION_COOKIE_NAME,
      buildClearSessionCookieOptions(secure),
    );

    const credential =
      await this.patientAdministrationSessionService.issueSameDeviceCredential(
        params.patientId,
        params.visitId,
        params.scaleInstanceId,
        input.expectedRevision,
        operator,
      );
    response.cookie(
      PATIENT_ADMINISTRATION_COOKIE_NAME,
      credential.rawToken,
      buildPatientAdministrationCookieOptions(secure, credential.expiresAt),
    );
    return credential.response;
  }

  @Post('preparation/confirm')
  @HttpCode(HttpStatus.OK)
  confirmPreparation(
    @Param() params: ScaleInstanceExecutionParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: ConfirmPatientAdministrationPreparationDto,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    return this.patientAdministrationSessionService.confirmPreparation(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      input.expectedRevision,
      input.impactFactorCodes,
      input.impactFactorNote,
      this.patientAdministrationSessionService.buildOperatorSnapshot(
        currentUser,
      ),
    );
  }

  @Post('pause')
  @HttpCode(HttpStatus.OK)
  pause(
    @Param() params: ScaleInstanceExecutionParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: PatientAdministrationControlDto,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    return this.patientAdministrationSessionService.pauseSession(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      input.expectedRevision,
      input.reason,
      this.patientAdministrationSessionService.buildOperatorSnapshot(
        currentUser,
      ),
    );
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  resume(
    @Param() params: ScaleInstanceExecutionParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: PatientAdministrationControlDto,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    return this.patientAdministrationSessionService.resumeSession(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      input.expectedRevision,
      input.reason,
      this.patientAdministrationSessionService.buildOperatorSnapshot(
        currentUser,
      ),
    );
  }

  @Post('entry-code/reissue')
  @HttpCode(HttpStatus.OK)
  reissueEntryCode(
    @Param() params: ScaleInstanceExecutionParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: PatientAdministrationRequiredReasonDto,
  ): Promise<PatientAdministrationEntryCodeResponse> {
    return this.patientAdministrationSessionService.reissueEntryCode(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      input.expectedRevision,
      input.reason,
      this.patientAdministrationSessionService.buildOperatorSnapshot(
        currentUser,
      ),
    );
  }

  @Post('terminate')
  @HttpCode(HttpStatus.OK)
  terminate(
    @Param() params: ScaleInstanceExecutionParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: PatientAdministrationRequiredReasonDto,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    return this.patientAdministrationSessionService.terminateSession(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      input.expectedRevision,
      input.reason,
      this.patientAdministrationSessionService.buildOperatorSnapshot(
        currentUser,
      ),
    );
  }

  @Post('current/complete')
  @HttpCode(HttpStatus.OK)
  completeCurrentStep(
    @Param() params: ScaleInstanceExecutionParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: CompletePatientAdministrationStaffStepDto,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    return this.patientAdministrationSessionService.completeStaffStep(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      input.expectedRevision,
      input.staffObservation,
      this.patientAdministrationSessionService.buildOperatorSnapshot(
        currentUser,
      ),
    );
  }

  @Post('current/takeover')
  @HttpCode(HttpStatus.OK)
  takeOverCurrentStep(
    @Param() params: ScaleInstanceExecutionParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: TakeOverPatientAdministrationStepDto,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    return this.patientAdministrationSessionService.takeOverCurrentStep(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      input.expectedRevision,
      input.reason,
      input.staffObservation,
      this.patientAdministrationSessionService.buildOperatorSnapshot(
        currentUser,
      ),
    );
  }

  @Post('redo-last')
  @HttpCode(HttpStatus.OK)
  redoLastStep(
    @Param() params: ScaleInstanceExecutionParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: PatientAdministrationRequiredReasonDto,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    return this.patientAdministrationSessionService.redoLastStep(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      input.expectedRevision,
      input.reason,
      this.patientAdministrationSessionService.buildOperatorSnapshot(
        currentUser,
      ),
    );
  }

  @Post('current/audio/:assetKey/replay-authorize')
  @HttpCode(HttpStatus.OK)
  authorizeTechnicalReplay(
    @Param() params: PatientAdministrationStaffAssetParamDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
    @Body() input: PatientAdministrationRequiredReasonDto,
  ): Promise<PatientAdministrationSessionSummaryResponse> {
    return this.patientAdministrationSessionService.authorizeTechnicalReplay(
      params.patientId,
      params.visitId,
      params.scaleInstanceId,
      params.assetKey,
      input.expectedRevision,
      input.reason,
      this.patientAdministrationSessionService.buildOperatorSnapshot(
        currentUser,
      ),
    );
  }
}
