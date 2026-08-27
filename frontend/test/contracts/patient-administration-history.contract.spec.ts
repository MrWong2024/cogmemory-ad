// Node-only contract spec: patient-administration history Client behavior.
import { expect, test } from '@playwright/test';

import {
  deletePatientAdministrationSession,
  listPatientAdministrationSessions,
} from '@/src/features/patient-administration/api/patient-administration-api';
import type {
  PatientAdministrationRouteIds,
  PatientAdministrationSessionSummary,
} from '@/src/features/patient-administration/types/patient-administration';

const ids: PatientAdministrationRouteIds = {
  patientId: 'patient/a',
  visitId: 'visit b',
  scaleInstanceId: 'scale-c',
};

const summary: PatientAdministrationSessionSummary = {
  id: 'session-a',
  deviceMode: 'same_device',
  status: 'terminated',
  currentStepKey: 'orientation_time',
  revision: 4,
  expiresAt: '2026-08-27T09:30:00.000Z',
  entryCodeExpiresAt: null,
  hasPatientCredential: false,
  preparationConfirmedAt: '2026-08-27T09:00:00.000Z',
  preparationConfirmedBy: null,
  impactFactorCodes: [],
  createdBy: { operatorId: 'operator-a', operatorName: '测试医护' },
  startedAt: '2026-08-27T09:05:00.000Z',
  pausedAt: null,
  completedAt: null,
  terminatedAt: '2026-08-27T09:10:00.000Z',
  expiredAt: null,
  createdAt: '2026-08-27T08:55:00.000Z',
  updatedAt: '2026-08-27T09:10:00.000Z',
};

test('history GET uses the encoded sessions path and preserves the response order', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  const expected = [
    { ...summary, id: 'session-newer' },
    { ...summary, id: 'session-older' },
  ];
  let calls = 0;

  globalThis.fetch = async (input, init) => {
    calls += 1;
    expect(new URL(String(input)).pathname).toBe(
      '/patients/patient%2Fa/visits/visit%20b/scale-instances/scale-c/patient-administration/sessions',
    );
    expect(init?.method).toBe('GET');
    expect(init?.signal).toBe(controller.signal);
    return new Response(JSON.stringify(expected), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await expect(listPatientAdministrationSessions(ids, controller.signal)).resolves.toEqual(
      expected,
    );
    expect(calls).toBe(1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('history DELETE sends one bodyless request to the encoded session path', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async (input, init) => {
    calls += 1;
    expect(new URL(String(input)).pathname).toBe(
      '/patients/patient%2Fa/visits/visit%20b/scale-instances/scale-c/patient-administration/sessions/session%2Fa',
    );
    expect(init?.method).toBe('DELETE');
    expect(init?.body).toBeUndefined();
    return new Response(null, { status: 204 });
  };

  try {
    await expect(deletePatientAdministrationSession(ids, 'session/a')).resolves.toBeUndefined();
    expect(calls).toBe(1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('history DELETE maps the precise not-deletable and not-found codes', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  try {
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          code: 'PATIENT_ADMINISTRATION_SESSION_NOT_DELETABLE',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    };
    await expect(
      deletePatientAdministrationSession(ids, 'session-a'),
    ).rejects.toMatchObject({
      kind: 'session_not_deletable',
      status: 409,
      backendCode: 'PATIENT_ADMINISTRATION_SESSION_NOT_DELETABLE',
    });
    expect(calls).toBe(1);

    globalThis.fetch = async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ code: 'PATIENT_ADMINISTRATION_SESSION_NOT_FOUND' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    };
    await expect(
      deletePatientAdministrationSession(ids, 'session-a'),
    ).rejects.toMatchObject({
      kind: 'session_not_found',
      status: 404,
      backendCode: 'PATIENT_ADMINISTRATION_SESSION_NOT_FOUND',
    });
    expect(calls).toBe(2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('history DELETE keeps existing conflicts distinct and never retries uncertain writes', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  try {
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ code: 'PATIENT_ADMINISTRATION_CONFLICT' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    await expect(
      deletePatientAdministrationSession(ids, 'session-a'),
    ).rejects.toMatchObject({ kind: 'session_conflict', status: 409 });
    expect(calls).toBe(1);

    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(null, { status: 503 });
    };
    await expect(
      deletePatientAdministrationSession(ids, 'session-a'),
    ).rejects.toMatchObject({ kind: 'request_outcome_uncertain', status: 503 });
    expect(calls).toBe(1);

    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new TypeError('network unavailable');
    };
    await expect(
      deletePatientAdministrationSession(ids, 'session-a'),
    ).rejects.toMatchObject({ kind: 'request_outcome_uncertain' });
    expect(calls).toBe(1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
