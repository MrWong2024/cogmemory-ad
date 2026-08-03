import { Types } from 'mongoose';
import {
  buildStableItemResponseScope,
  itemResponseScopesEqual,
  itemResponseSubmissionBarrierBlocksWrites,
  normalizeItemResponseSubmissionWriteBarrier,
  normalizeScaleInstanceSubmissionWriteBarrier,
  scaleInstanceSubmissionBarrierBlocksWrites,
} from './scale-instance-submission-write-barrier';

describe('scale instance submission write barrier', () => {
  const firstItemId = '507f1f77bcf86cd799439016';
  const secondItemId = '507f1f77bcf86cd799439017';
  const barrierId = '72e65c76-d7fa-4ce8-a50c-169541a22a64';
  const startedAt = new Date('2026-08-03T01:00:00.000Z');

  function parent(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      version: 1,
      barrierId,
      state: 'fenced',
      startedAt,
      fencedAt: new Date('2026-08-03T01:00:01.000Z'),
      releaseStartedAt: null,
      completedAt: null,
      startedBy: new Types.ObjectId('507f1f77bcf86cd799439019'),
      startedByName: 'Test Operator',
      startedByRole: 'doctor',
      itemResponseIds: [firstItemId, secondItemId],
      expectedItemCount: 2,
      ...overrides,
    };
  }

  it('builds a unique sorted ObjectId scope and compares exact membership', () => {
    expect(buildStableItemResponseScope([secondItemId, firstItemId])).toEqual([
      firstItemId,
      secondItemId,
    ]);
    expect(buildStableItemResponseScope([firstItemId, firstItemId])).toEqual([
      firstItemId,
    ]);
    expect(buildStableItemResponseScope(['not-an-object-id'])).toBeNull();
    expect(
      itemResponseScopesEqual(
        [secondItemId, firstItemId],
        [firstItemId, secondItemId],
      ),
    ).toBe(true);
    expect(
      itemResponseScopesEqual(
        [firstItemId, firstItemId],
        [firstItemId, secondItemId],
      ),
    ).toBe(false);
  });

  it('normalizes valid parent and child barriers', () => {
    const parsedParent = normalizeScaleInstanceSubmissionWriteBarrier(parent());
    expect(parsedParent.kind).toBe('valid');
    if (parsedParent.kind !== 'valid') {
      throw new Error('Expected a valid parent barrier');
    }
    expect(parsedParent.value.barrierId).toBe(barrierId);
    expect(parsedParent.value.state).toBe('fenced');
    expect(parsedParent.value.itemResponseIds).toEqual([
      firstItemId,
      secondItemId,
    ]);
    expect(
      normalizeItemResponseSubmissionWriteBarrier({
        version: 1,
        barrierId,
        startedAt,
      }),
    ).toEqual({
      kind: 'valid',
      value: { version: 1, barrierId, startedAt },
    });
  });

  it.each([
    ['unsupported version', { version: 2 }],
    ['unknown state', { state: 'paused' }],
    ['duplicate scope', { itemResponseIds: [firstItemId, firstItemId] }],
    ['invalid scope member', { itemResponseIds: [firstItemId, 'invalid'] }],
    ['count mismatch', { expectedItemCount: 1 }],
    ['unordered scope', { itemResponseIds: [secondItemId, firstItemId] }],
    ['missing state date', { fencedAt: null }],
    [
      'invalid date ordering',
      { fencedAt: new Date('2026-08-02T01:00:00.000Z') },
    ],
  ])('rejects %s fail closed', (_label, overrides) => {
    expect(
      normalizeScaleInstanceSubmissionWriteBarrier(parent(overrides)).kind,
    ).toBe('invalid');
    expect(scaleInstanceSubmissionBarrierBlocksWrites(parent(overrides))).toBe(
      true,
    );
  });

  it('treats only null or missing barriers as open for writes', () => {
    expect(scaleInstanceSubmissionBarrierBlocksWrites(null)).toBe(false);
    expect(scaleInstanceSubmissionBarrierBlocksWrites(undefined)).toBe(false);
    expect(itemResponseSubmissionBarrierBlocksWrites(null)).toBe(false);
    expect(itemResponseSubmissionBarrierBlocksWrites(undefined)).toBe(false);
    expect(itemResponseSubmissionBarrierBlocksWrites({ broken: true })).toBe(
      true,
    );
    expect(
      itemResponseSubmissionBarrierBlocksWrites({
        version: 1,
        barrierId,
        startedAt,
      }),
    ).toBe(true);
  });

  it('accepts the exact releasing and completed invariants', () => {
    expect(
      normalizeScaleInstanceSubmissionWriteBarrier(
        parent({
          state: 'releasing',
          releaseStartedAt: new Date('2026-08-03T01:00:02.000Z'),
        }),
      ).kind,
    ).toBe('valid');
    expect(
      normalizeScaleInstanceSubmissionWriteBarrier(
        parent({
          state: 'completed',
          completedAt: new Date('2026-08-03T01:00:03.000Z'),
        }),
      ).kind,
    ).toBe('valid');
  });
});
