import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESSION_COOKIE_NAME } from '../../auth/auth.constants';
import { AuthService } from '../../auth/services/auth.service';
import {
  buildClearSessionCookieOptions,
  readSessionTokenFromRequest,
} from '../../auth/utils/session-cookie.util';
import type { SessionCookieResponse } from '../../auth/utils/session-cookie.util';
import {
  CompletePatientAdministrationStepDto,
  EnterPatientAdministrationDto,
  PatientAdministrationAssetParamDto,
  PatientAdministrationRevisionDto,
} from '../dto/patient-administration.dto';
import { PatientAdministrationSessionGuard } from '../guards/patient-administration-session.guard';
import { PATIENT_ADMINISTRATION_COOKIE_NAME } from '../patient-administration.constants';
import { PatientAdministrationSessionService } from '../services/patient-administration-session.service';
import type {
  PatientAdministrationCredentialResponse,
  PatientAdministrationCurrentResponse,
  PatientAdministrationHttpRequest,
} from '../types/patient-administration-response.types';
import {
  buildClearPatientAdministrationCookieOptions,
  buildPatientAdministrationCookieOptions,
} from '../utils/patient-administration-cookie.util';

type PatientAssetResponse = SessionCookieResponse & {
  setHeader(name: string, value: string | number): void;
};

@Controller('patient-administration')
export class PatientAdministrationController {
  constructor(
    private readonly patientAdministrationSessionService: PatientAdministrationSessionService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('enter')
  @HttpCode(HttpStatus.OK)
  async enter(
    @Body() input: EnterPatientAdministrationDto,
    @Req() request: PatientAdministrationHttpRequest,
    @Res({ passthrough: true }) response: SessionCookieResponse,
  ): Promise<PatientAdministrationCredentialResponse> {
    const secure = this.configService.getOrThrow<boolean>(
      'session.cookieSecure',
    );
    const rawStaffToken = readSessionTokenFromRequest(request);
    if (rawStaffToken) {
      const staffUser =
        await this.authService.validateSessionToken(rawStaffToken);
      if (staffUser) {
        throw new ConflictException({
          code: 'PATIENT_ADMINISTRATION_SESSION_CONFLICT',
          message: 'Use same-device handoff while a staff session is active',
        });
      }
      response.clearCookie(
        SESSION_COOKIE_NAME,
        buildClearSessionCookieOptions(secure),
      );
    }

    const userAgent = this.readHeaderValue(request.headers?.['user-agent']);
    const clientKey =
      this.patientAdministrationSessionService.buildEntryClientKey(
        request.ip ?? request.socket?.remoteAddress,
        userAgent,
      );
    const credential =
      await this.patientAdministrationSessionService.redeemEntryCode(
        input.code,
        clientKey,
      );
    response.cookie(
      PATIENT_ADMINISTRATION_COOKIE_NAME,
      credential.rawToken,
      buildPatientAdministrationCookieOptions(secure, credential.expiresAt),
    );
    return credential.response;
  }

  @Get('current')
  @UseGuards(PatientAdministrationSessionGuard)
  getCurrent(
    @Req() request: PatientAdministrationHttpRequest,
  ): Promise<PatientAdministrationCurrentResponse> {
    if (!request.patientAdministration) {
      throw new UnauthorizedException();
    }
    return this.patientAdministrationSessionService.getCurrent(
      request.patientAdministration,
    );
  }

  @Post('current/complete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PatientAdministrationSessionGuard)
  async completeCurrentStep(
    @Body() input: CompletePatientAdministrationStepDto,
    @Req() request: PatientAdministrationHttpRequest,
    @Res({ passthrough: true }) response: SessionCookieResponse,
  ): Promise<PatientAdministrationCurrentResponse> {
    if (!request.patientAdministration) {
      throw new UnauthorizedException();
    }
    const result =
      await this.patientAdministrationSessionService.completePatientStep(
        request.patientAdministration,
        input.expectedRevision,
      );
    if (result.status === 'completed') {
      response.clearCookie(
        PATIENT_ADMINISTRATION_COOKIE_NAME,
        buildClearPatientAdministrationCookieOptions(
          this.configService.getOrThrow<boolean>('session.cookieSecure'),
        ),
      );
    }
    return result;
  }

  @Get('current/assets/:assetKey')
  @UseGuards(PatientAdministrationSessionGuard)
  async getCurrentImage(
    @Param() params: PatientAdministrationAssetParamDto,
    @Req() request: PatientAdministrationHttpRequest,
    @Res({ passthrough: true }) response: PatientAssetResponse,
  ): Promise<StreamableFile> {
    if (!request.patientAdministration) {
      throw new UnauthorizedException();
    }
    const asset =
      await this.patientAdministrationSessionService.openCurrentImage(
        request.patientAdministration,
        params.assetKey,
      );
    this.setAssetHeaders(response, asset.mimeType, asset.size);
    return new StreamableFile(asset.stream);
  }

  @Post('current/audio/:assetKey/play')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PatientAdministrationSessionGuard)
  async playCurrentAudio(
    @Param() params: PatientAdministrationAssetParamDto,
    @Body() input: PatientAdministrationRevisionDto,
    @Req() request: PatientAdministrationHttpRequest,
    @Res({ passthrough: true }) response: PatientAssetResponse,
  ): Promise<StreamableFile> {
    if (!request.patientAdministration) {
      throw new UnauthorizedException();
    }
    const result =
      await this.patientAdministrationSessionService.playCurrentAudio(
        request.patientAdministration,
        params.assetKey,
        input.expectedRevision,
      );
    this.setAssetHeaders(
      response,
      result.asset.mimeType,
      result.asset.size,
      result.revision,
    );
    return new StreamableFile(result.asset.stream);
  }

  private setAssetHeaders(
    response: PatientAssetResponse,
    mimeType: string,
    size: number,
    revision?: number,
  ): void {
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Length', size);
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (revision !== undefined) {
      response.setHeader(
        'X-Patient-Administration-Revision',
        revision.toString(),
      );
    }
  }

  private readHeaderValue(
    value: string | string[] | undefined,
  ): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
