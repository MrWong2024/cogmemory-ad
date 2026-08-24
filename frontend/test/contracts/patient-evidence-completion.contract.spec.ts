import { expect, test } from '@playwright/test';

import { runPatientEvidenceCompletion } from '@/src/features/patient-administration/lib/patient-evidence-completion';

test('unsaved evidence uploads before completing exactly once', async () => {
  const calls: string[] = [];

  const result = await runPatientEvidenceCompletion({
    skipUpload: false,
    upload: async () => {
      calls.push('upload');
      return 'success';
    },
    complete: async () => {
      calls.push('complete');
    },
  });

  expect(result).toBe('complete_attempted');
  expect(calls).toEqual(['upload', 'complete']);
});

test('ordinary upload failure does not attempt completion', async () => {
  let uploadCalls = 0;
  let completeCalls = 0;

  const result = await runPatientEvidenceCompletion({
    skipUpload: false,
    upload: async () => {
      uploadCalls += 1;
      return 'failed';
    },
    complete: async () => {
      completeCalls += 1;
    },
  });

  expect(result).toBe('failed');
  expect(uploadCalls).toBe(1);
  expect(completeCalls).toBe(0);
});

test('conflict or uncertain upload result stops the same-click completion', async () => {
  let uploadCalls = 0;
  let completeCalls = 0;

  const result = await runPatientEvidenceCompletion({
    skipUpload: false,
    upload: async () => {
      uploadCalls += 1;
      return 'conflict_or_uncertain';
    },
    complete: async () => {
      completeCalls += 1;
    },
  });

  expect(result).toBe('conflict_or_uncertain');
  expect(uploadCalls).toBe(1);
  expect(completeCalls).toBe(0);
});

test('complete-only recovery skips upload and attempts completion once', async () => {
  let uploadCalls = 0;
  let completeCalls = 0;

  const result = await runPatientEvidenceCompletion({
    skipUpload: true,
    upload: async () => {
      uploadCalls += 1;
      return 'success';
    },
    complete: async () => {
      completeCalls += 1;
    },
  });

  expect(result).toBe('complete_attempted');
  expect(uploadCalls).toBe(0);
  expect(completeCalls).toBe(1);
});

test('already-saved retry uses the same skip-upload completion path', async () => {
  const calls: string[] = [];

  await runPatientEvidenceCompletion({
    skipUpload: true,
    upload: async () => {
      calls.push('upload');
      return 'success';
    },
    complete: async () => {
      calls.push('complete');
    },
  });

  expect(calls).toEqual(['complete']);
});
