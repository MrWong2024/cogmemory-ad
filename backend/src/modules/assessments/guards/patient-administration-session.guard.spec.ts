import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { SESSION_COOKIE_NAME } from '../../auth/auth.constants';
import { AuthService } from '../../auth/services/auth.service';
import { PATIENT_ADMINISTRATION_COOKIE_NAME } from '../patient-administration.constants';
import { PatientAdministrationSessionService } from '../services/patient-administration-session.service';
import type { PatientAdministrationHttpRequest } from '../types/patient-administration-response.types';
import { PatientAdministrationSessionGuard } from './patient-administration-session.guard';

type CookieResponseStub = {
  clearCookie: jest.Mock;
};

function createExecutionContext(
  request: PatientAdministrationHttpRequest,
  response: CookieResponseStub,
) {
  const context = new ExecutionContextHost([request, response]);
  context.setType('http');
  return context;
}

describe('PatientAdministrationSessionGuard', () => {
  let guard: PatientAdministrationSessionGuard;
  let sessionService: { validatePatientCredential: jest.Mock };
  let authService: { validateSessionToken: jest.Mock };
  let response: CookieResponseStub;

  beforeEach(async () => {
    sessionService = { validatePatientCredential: jest.fn() };
    authService = { validateSessionToken: jest.fn() };
    response = { clearCookie: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PatientAdministrationSessionGuard,
        {
          provide: PatientAdministrationSessionService,
          useValue: sessionService,
        },
        { provide: AuthService, useValue: authService },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue(true) },
        },
      ],
    }).compile();
    guard = moduleRef.get(PatientAdministrationSessionGuard);
  });

  it('rejects a missing patient cookie without attaching context', async () => {
    const request: PatientAdministrationHttpRequest = { headers: {} };
    await expect(
      guard.canActivate(createExecutionContext(request, response)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.patientAdministration).toBeUndefined();
    expect(sessionService.validatePatientCredential).not.toHaveBeenCalled();
  });

  it('clears the patient cookie when a valid staff identity also exists', async () => {
    authService.validateSessionToken.mockResolvedValue({ id: 'staff' });
    const request: PatientAdministrationHttpRequest = {
      headers: {},
      cookies: {
        [PATIENT_ADMINISTRATION_COOKIE_NAME]: 'patient-token',
        [SESSION_COOKIE_NAME]: 'staff-token',
      },
    };

    await expect(
      guard.canActivate(createExecutionContext(request, response)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessionService.validatePatientCredential).not.toHaveBeenCalled();
    expect(response.clearCookie).toHaveBeenCalledWith(
      PATIENT_ADMINISTRATION_COOKIE_NAME,
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/patient-administration',
      },
    );
  });

  it('clears an invalid or expired patient credential', async () => {
    authService.validateSessionToken.mockResolvedValue(null);
    sessionService.validatePatientCredential.mockResolvedValue(null);
    const request: PatientAdministrationHttpRequest = {
      headers: {},
      cookies: {
        [PATIENT_ADMINISTRATION_COOKIE_NAME]: 'invalid-patient-token',
      },
    };

    await expect(
      guard.canActivate(createExecutionContext(request, response)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(response.clearCookie).toHaveBeenCalledTimes(1);
  });

  it('attaches only the minimum internal credential context', async () => {
    const patientContext = {
      sessionId: '507f1f77bcf86cd799439011',
      sessionTokenHash: 'a'.repeat(64),
      revision: 3,
    };
    sessionService.validatePatientCredential.mockResolvedValue(patientContext);
    const request: PatientAdministrationHttpRequest = {
      headers: {},
      cookies: {
        [PATIENT_ADMINISTRATION_COOKIE_NAME]: 'raw-patient-token',
      },
    };

    await expect(
      guard.canActivate(createExecutionContext(request, response)),
    ).resolves.toBe(true);
    expect(request.patientAdministration).toEqual(patientContext);
    expect(request.patientAdministration).not.toHaveProperty('rawToken');
    expect(request.patientAdministration).not.toHaveProperty('patient');
    expect(response.clearCookie).not.toHaveBeenCalled();
  });
});
