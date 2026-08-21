import { expect, test } from '@playwright/test';
import {
  sanitizeIdentifier,
  sanitizeUrlPattern,
} from '../support/safe-output';

const MONGO_ID = '507f1f77bcf86cd799439011';
const UUID = '550e8400-e29b-41d4-a716-446655440000';
const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const SYNTHETIC_OPAQUE_TOKEN = 'Synthetic_Opaque_Token_0123456789ABCDEF';

test('sanitizes dynamic URL values while preserving route structure', () => {
  for (const identifier of [MONGO_ID, UUID, ULID, SYNTHETIC_OPAQUE_TOKEN]) {
    expect(sanitizeIdentifier(identifier)).toBe('<id>');
    expect(sanitizeUrlPattern(`http://example.test/items/${identifier}`)).toBe(
      '/items/<id>',
    );
  }

  const routeCases = [
    {
      input: 'http://example.test/patient-administration/current',
      expected: '/patient-administration/current',
    },
    {
      input: 'http://example.test/cognitive-domain-results/latest',
      expected: '/cognitive-domain-results/latest',
    },
    {
      input: 'http://example.test/clinical-reports',
      expected: '/clinical-reports',
    },
    {
      input: 'http://example.test/patients',
      expected: '/patients',
    },
    {
      input:
        'http://example.test/patients/507f1f77bcf86cd799439011/visits/507f1f77bcf86cd799439012/scale-instances/507f1f77bcf86cd799439013/patient-administration',
      expected:
        '/patients/<id>/visits/<id>/scale-instances/<id>/patient-administration',
    },
  ] as const;

  for (const { input, expected } of routeCases) {
    expect(sanitizeUrlPattern(input)).toBe(expected);
  }

  const urlWithQueryAndHash =
    `https://example.test/patients/${MONGO_ID}/patient-administration` +
    '?code=synthetic-secret#synthetic-fragment';
  const sanitized = sanitizeUrlPattern(urlWithQueryAndHash);
  expect(sanitized).toBe('/patients/<id>/patient-administration');
  expect(sanitized).not.toContain('synthetic-secret');
  expect(sanitized).not.toContain('synthetic-fragment');
});
