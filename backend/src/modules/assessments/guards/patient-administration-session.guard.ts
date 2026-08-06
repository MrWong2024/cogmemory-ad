import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../auth/services/auth.service';
import {
  readCookieValue,
  readSessionTokenFromRequest,
} from '../../auth/utils/session-cookie.util';
import type { SessionCookieResponse } from '../../auth/utils/session-cookie.util';
import { PATIENT_ADMINISTRATION_COOKIE_NAME } from '../patient-administration.constants';
import { PatientAdministrationSessionService } from '../services/patient-administration-session.service';
import type { PatientAdministrationHttpRequest } from '../types/patient-administration-response.types';
import { buildClearPatientAdministrationCookieOptions } from '../utils/patient-administration-cookie.util';

@Injectable()
export class PatientAdministrationSessionGuard implements CanActivate {
  constructor(
    private readonly patientAdministrationSessionService: PatientAdministrationSessionService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<PatientAdministrationHttpRequest>();
    const response = http.getResponse<SessionCookieResponse>();
    const secure = this.configService.getOrThrow<boolean>(
      'session.cookieSecure',
    );
    const rawPatientToken = readCookieValue(
      request,
      PATIENT_ADMINISTRATION_COOKIE_NAME,
    );

    if (!rawPatientToken) {
      throw new UnauthorizedException();
    }

    const rawStaffToken = readSessionTokenFromRequest(request);
    if (
      rawStaffToken &&
      (await this.authService.validateSessionToken(rawStaffToken))
    ) {
      response.clearCookie(
        PATIENT_ADMINISTRATION_COOKIE_NAME,
        buildClearPatientAdministrationCookieOptions(secure),
      );
      throw new UnauthorizedException();
    }

    const patientContext =
      await this.patientAdministrationSessionService.validatePatientCredential(
        rawPatientToken,
      );
    if (!patientContext) {
      response.clearCookie(
        PATIENT_ADMINISTRATION_COOKIE_NAME,
        buildClearPatientAdministrationCookieOptions(secure),
      );
      throw new UnauthorizedException();
    }

    request.patientAdministration = patientContext;
    return true;
  }
}
