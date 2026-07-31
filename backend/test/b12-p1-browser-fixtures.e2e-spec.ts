import {
  B12_P1_PROFILES,
  B12P1FixtureError,
  b12P1AccountName,
  b12P1ProfileName,
  b12P1ScenarioIds,
  validateB12P1Profile,
} from '../scripts/b12-p1-browser-fixtures';

describe('B12 P1 Browser fixture contract', () => {
  it('keeps all seven Profile namespaces and route roots deterministic and disjoint', () => {
    const profileNames = B12_P1_PROFILES.map(b12P1ProfileName);
    expect(new Set(profileNames).size).toBe(7);
    expect(profileNames).toEqual([
      'B12-P1-A-lifecycle-state',
      'B12-P1-B-authorized-roles',
      'B12-P1-C-restricted-roles',
      'B12-P1-D-report-eligibility-gates',
      'B12-P1-E-visit-status-gates',
      'B12-P1-F-lock-consistency',
      'B12-P1-G-locked-readonly-semantics',
    ]);

    const ids = B12_P1_PROFILES.flatMap((profile) => {
      const value = b12P1ScenarioIds(profile, 'contract-probe');
      return [
        value.patientId.toString(),
        value.visitId.toString(),
        value.instanceId.toString(),
        value.reportId.toString(),
      ];
    });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('accepts only safe Profile letters and derives fixed non-secret account names', () => {
    expect(validateB12P1Profile(' A ')).toBe('a');
    expect(b12P1AccountName('c', 'research_assistant')).toBe(
      'b12p1-c-research-assistant',
    );
    expect(() => validateB12P1Profile('all')).toThrow(B12P1FixtureError);
    expect(() => validateB12P1Profile('../a')).toThrow(B12P1FixtureError);
  });
});
