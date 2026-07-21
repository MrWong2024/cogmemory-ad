import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHandwritingTrajectoryPayload,
  countHandwritingPoints,
  createHandwritingTrajectoryBlob,
  HANDWRITING_CANVAS_HEIGHT,
  HANDWRITING_CANVAS_WIDTH,
  MAX_HANDWRITING_POINTS,
  MAX_HANDWRITING_TRAJECTORY_BYTES,
} from '@/src/features/assessments/lib/handwriting-evidence';
import type {
  HandwritingDraft,
  HandwritingStroke,
} from '@/src/features/assessments/types/handwriting-evidence';

function createDraft(
  pointCount: number,
  tool: HandwritingStroke['tool'] = 'mouse',
): HandwritingDraft {
  return {
    strokes: [
      {
        tool,
        points: Array.from({ length: pointCount }, (_, index) => ({
          x: index % HANDWRITING_CANVAS_WIDTH,
          y: index % HANDWRITING_CANVAS_HEIGHT,
          t: index,
          pressure: 0.5,
        })),
      },
    ],
    canvasWidth: HANDWRITING_CANVAS_WIDTH,
    canvasHeight: HANDWRITING_CANVAS_HEIGHT,
    drawingStartedAtMs: 0,
    description: '',
    captureNote: '',
    operatorNote: '',
    includeTrajectory: true,
  };
}

function createDraftAtSerializedSize(targetBytes: number): HandwritingDraft {
  const emptyToolDraft = createDraft(1, '' as HandwritingStroke['tool']);
  const baseBytes = new Blob([
    JSON.stringify(buildHandwritingTrajectoryPayload(emptyToolDraft)),
  ]).size;
  const fillerBytes = targetBytes - baseBytes;

  assert.ok(fillerBytes >= 0, 'target must fit the serialized payload shell');
  return createDraft(1, 'x'.repeat(fillerBytes) as HandwritingStroke['tool']);
}

function attemptValidatedUpload(
  draft: HandwritingDraft,
  onUpload: (trajectory: Blob) => void,
  onServerSideEffect: () => void,
): void {
  const trajectory = createHandwritingTrajectoryBlob(draft);
  onUpload(trajectory);
  onServerSideEffect();
}

test('B5-MV-042 accepts exactly 8000 points and rejects 8001 before upload', () => {
  assert.equal(MAX_HANDWRITING_POINTS, 8000);

  const maximumDraft = createDraft(MAX_HANDWRITING_POINTS);
  assert.equal(countHandwritingPoints(maximumDraft.strokes), 8000);
  assert.equal(
    buildHandwritingTrajectoryPayload(maximumDraft).strokes[0].points.length,
    8000,
  );
  assert.doesNotThrow(() => createHandwritingTrajectoryBlob(maximumDraft));

  const rejectedDraft = createDraft(MAX_HANDWRITING_POINTS + 1);
  let uploadCalls = 0;
  let serverSideEffects = 0;
  assert.throws(
    () =>
      attemptValidatedUpload(
        rejectedDraft,
        () => {
          uploadCalls += 1;
        },
        () => {
          serverSideEffects += 1;
        },
      ),
    new Error('手写轨迹超过 8000 点，请简化书写或清空重画。'),
  );
  assert.equal(uploadCalls, 0);
  assert.equal(serverSideEffects, 0);
});

test('B5-MV-043 accepts exactly 2 MiB and rejects the next byte before upload', () => {
  assert.equal(MAX_HANDWRITING_TRAJECTORY_BYTES, 2 * 1024 * 1024);

  const maximumDraft = createDraftAtSerializedSize(
    MAX_HANDWRITING_TRAJECTORY_BYTES,
  );
  const maximumBlob = createHandwritingTrajectoryBlob(maximumDraft);
  assert.equal(maximumBlob.size, MAX_HANDWRITING_TRAJECTORY_BYTES);

  const rejectedDraft = createDraftAtSerializedSize(
    MAX_HANDWRITING_TRAJECTORY_BYTES + 1,
  );
  let uploadCalls = 0;
  let serverSideEffects = 0;
  assert.throws(
    () =>
      attemptValidatedUpload(
        rejectedDraft,
        () => {
          uploadCalls += 1;
        },
        () => {
          serverSideEffects += 1;
        },
      ),
    new Error('手写轨迹超过 2 MiB 安全限制，请简化书写或清空重画。'),
  );
  assert.equal(uploadCalls, 0);
  assert.equal(serverSideEffects, 0);
});
