import { expect, test } from '@playwright/test';

import {
  getInlineSubmissionIssueSnapshotLabel,
  routeScaleSubmissionIssues,
} from '@/src/features/assessments/lib/scale-submission-issue-routing';
import { buildInlineActionableIssuePresentations } from '@/src/features/assessments/lib/scale-submission-inline-presentation';
import { getScaleSubmissionIssueDisplay } from '@/src/features/assessments/lib/scale-instance-submission-display';
import { routePatientReviewReferences } from '@/src/features/patient-administration/lib/patient-review-reference-routing';
import type {
  ScaleSubmissionIssue,
  ScaleSubmissionIssueSeverity,
  ScaleSubmissionIssueScope,
} from '@/src/features/assessments/types/scale-instance-submission';
import type { PatientAdministrationReviewStep } from '@/src/features/patient-administration/types/patient-administration';

function createReviewStep(
  stepKey: string,
  structuredFieldCodes: string[],
): PatientAdministrationReviewStep {
  return {
    stepKey,
    order: 1,
    responseMode: 'speech',
    advanceBy: 'patient',
    structuredFieldCodes,
    runs: [],
  };
}

function createIssue(input: {
  code: ScaleSubmissionIssue['code'];
  severity: ScaleSubmissionIssueSeverity;
  scope?: ScaleSubmissionIssueScope;
  itemResponseId?: string;
  itemCode?: string;
}): ScaleSubmissionIssue {
  return {
    code: input.code,
    severity: input.severity,
    scope: input.scope ?? 'item',
    itemResponseId: input.itemResponseId,
    itemCode: input.itemCode,
    message: input.code,
  };
}

test('item response id is authoritative and uniquely matched item code is only a fallback', () => {
  const idIssue = createIssue({
    code: 'ITEM_NOT_COMPLETED',
    severity: 'blocking',
    itemResponseId: 'item-a',
    itemCode: 'CODE_B',
  });
  const codeFallbackIssue = createIssue({
    code: 'ITEM_REQUIRED_MEDIA_MISSING',
    severity: 'blocking',
    itemCode: 'CODE_B',
  });
  const unmatchedIdIssue = createIssue({
    code: 'ITEM_ANSWER_CONTENT_MISSING',
    severity: 'blocking',
    itemResponseId: 'missing-id',
    itemCode: 'CODE_A',
  });
  const routing = routeScaleSubmissionIssues(
    {
      blockingIssues: [idIssue, codeFallbackIssue, unmatchedIdIssue],
      warnings: [],
    },
    [
      { id: 'item-a', itemCode: 'CODE_A' },
      { id: 'item-b', itemCode: 'CODE_B' },
    ],
  );

  expect(routing.inlineByItemResponseId.get('item-a')?.blockingIssues).toEqual([
    idIssue,
  ]);
  expect(routing.inlineByItemResponseId.get('item-b')?.blockingIssues).toEqual([
    codeFallbackIssue,
  ]);
  expect(routing.globalBlockingIssues).toEqual([unmatchedIdIssue]);
});

test('ambiguous item codes and scale-instance issues remain global without losing either severity', () => {
  const ambiguousWarning = createIssue({
    code: 'ITEM_STALE_MISSING_REASON',
    severity: 'warning',
    itemCode: 'DUPLICATE',
  });
  const scaleBlocking = createIssue({
    code: 'SCALE_INSTANCE_ITEM_SET_MISMATCH',
    severity: 'blocking',
    scope: 'scale_instance',
  });
  const mappedWarning = createIssue({
    code: 'SCALE_INSTANCE_DURATION_UNAVAILABLE',
    severity: 'warning',
    itemResponseId: 'item-c',
  });
  const routing = routeScaleSubmissionIssues(
    {
      blockingIssues: [scaleBlocking],
      warnings: [ambiguousWarning, mappedWarning],
    },
    [
      { id: 'item-a', itemCode: 'DUPLICATE' },
      { id: 'item-b', itemCode: 'DUPLICATE' },
      { id: 'item-c', itemCode: 'UNIQUE' },
    ],
  );

  expect(routing.globalBlockingIssues).toEqual([scaleBlocking]);
  expect(routing.globalWarnings).toEqual([ambiguousWarning]);
  expect(routing.inlineByItemResponseId.get('item-c')?.warnings).toEqual([
    mappedWarning,
  ]);
  const routedIssueCount =
    routing.globalBlockingIssues.length +
    routing.globalWarnings.length +
    [...routing.inlineByItemResponseId.values()].reduce(
      (count, issues) =>
        count + issues.blockingIssues.length + issues.warnings.length,
      0,
    );
  expect(routedIssueCount).toBe(3);
});

test('inline readiness labels distinguish a stale snapshot from the latest check', () => {
  expect(getInlineSubmissionIssueSnapshotLabel(true)).toBe(
    '上次提交检查结果（已过期）',
  );
  expect(getInlineSubmissionIssueSnapshotLabel(false)).toBe(
    '最新提交检查结果',
  );
});

test('routes a single known code to its field and every other placement to shared exactly once', () => {
  const fieldSpecific = createReviewStep('single', ['field-a']);
  const multiField = createReviewStep('multi', ['field-a', 'field-b']);
  const unmapped = createReviewStep('unmapped', []);
  const runtimeMismatch = createReviewStep('mismatch', ['unknown-field']);
  const input = [fieldSpecific, multiField, unmapped, runtimeMismatch];

  const routing = routePatientReviewReferences(
    [{ code: 'field-a' }, { code: 'field-b' }],
    input,
  );

  expect(routing.fieldSpecificStepsByCode).toEqual({
    'field-a': [fieldSpecific],
  });
  expect(routing.sharedSteps).toEqual([
    multiField,
    unmapped,
    runtimeMismatch,
  ]);
  const routedSteps = [
    ...Object.values(routing.fieldSpecificStepsByCode).flat(),
    ...routing.sharedSteps,
  ];
  expect(routedSteps).toHaveLength(input.length);
  expect(routedSteps.map((step) => step.stepKey).sort()).toEqual(
    input.map((step) => step.stepKey).sort(),
  );
});

test('routes all patient steps to shared when the formal item has no structured fields', () => {
  const steps = [
    createReviewStep('single', ['field-a']),
    createReviewStep('unmapped', []),
  ];

  const routing = routePatientReviewReferences(null, steps);

  expect(routing.fieldSpecificStepsByCode).toEqual({});
  expect(routing.sharedSteps).toEqual(steps);
});

test('collapses structured incompleteness into one actionable inline presentation', () => {
  const issues = [
    createIssue({
      code: 'ITEM_STRUCTURED_SUBITEMS_INCOMPLETE',
      severity: 'blocking',
      itemResponseId: 'item-a',
    }),
    createIssue({
      code: 'ITEM_ANSWER_CONTENT_MISSING',
      severity: 'blocking',
      itemResponseId: 'item-a',
    }),
    createIssue({
      code: 'ITEM_NOT_COMPLETED',
      severity: 'blocking',
      itemResponseId: 'item-a',
    }),
  ];
  const snapshot = structuredClone(issues);
  const presentations = buildInlineActionableIssuePresentations(issues);

  expect(presentations).toHaveLength(1);
  expect(presentations[0]?.title).toBe('本题结构化复核尚未完成');
  expect(presentations[0]?.sourceIssues).toHaveLength(3);
  expect(issues).toEqual(snapshot);
});

test('collapses binary decision incompleteness without swallowing media blockers', () => {
  const issues = [
    createIssue({
      code: 'ITEM_BINARY_MANUAL_DECISION_INCOMPLETE',
      severity: 'blocking',
      itemResponseId: 'item-a',
    }),
    createIssue({
      code: 'ITEM_ANSWER_CONTENT_MISSING',
      severity: 'blocking',
      itemResponseId: 'item-a',
    }),
    createIssue({
      code: 'ITEM_NOT_COMPLETED',
      severity: 'blocking',
      itemResponseId: 'item-a',
    }),
    createIssue({
      code: 'ITEM_REQUIRED_MEDIA_MISSING',
      severity: 'blocking',
      itemResponseId: 'item-a',
    }),
  ];
  const presentations = buildInlineActionableIssuePresentations(issues);

  expect(presentations).toHaveLength(2);
  expect(presentations[0]?.title).toBe('本题人工评分判断尚未完成');
  expect(presentations[1]?.sourceIssues[0]?.code).toBe(
    'ITEM_REQUIRED_MEDIA_MISSING',
  );
});

test('collapses reading observation and scoring blockers into one clinician action', () => {
  const issues = [
    createIssue({
      code: 'ITEM_MANUAL_OBSERVATION_INCOMPLETE',
      severity: 'blocking',
      itemResponseId: 'item-a',
    }),
    createIssue({
      code: 'ITEM_BINARY_MANUAL_DECISION_INCOMPLETE',
      severity: 'blocking',
      itemResponseId: 'item-a',
    }),
    createIssue({
      code: 'ITEM_ANSWER_CONTENT_MISSING',
      severity: 'blocking',
      itemResponseId: 'item-a',
    }),
    createIssue({
      code: 'ITEM_NOT_COMPLETED',
      severity: 'blocking',
      itemResponseId: 'item-a',
    }),
  ];
  const presentations = buildInlineActionableIssuePresentations(issues);

  expect(presentations).toEqual([
    expect.objectContaining({
      title: '本题复核尚未完成',
      description:
        '请记录患者实际阅读情况和闭眼动作，完成评分判断后标记本题完成。',
      sourceIssues: issues,
    }),
  ]);
  expect(
    getScaleSubmissionIssueDisplay('ITEM_MANUAL_OBSERVATION_INCOMPLETE'),
  ).toEqual({
    title: '患者原始观察尚未完成',
    description: '请记录患者实际阅读情况和闭眼动作，再完成本题评分判断。',
  });
});

test('collapses answer missing plus not completed while leaving warnings unchanged', () => {
  const blockers = [
    createIssue({
      code: 'ITEM_ANSWER_CONTENT_MISSING',
      severity: 'blocking',
      itemResponseId: 'item-a',
    }),
    createIssue({
      code: 'ITEM_NOT_COMPLETED',
      severity: 'blocking',
      itemResponseId: 'item-a',
    }),
  ];
  const warnings = [
    createIssue({
      code: 'ITEM_STALE_MISSING_REASON',
      severity: 'warning',
      itemResponseId: 'item-a',
    }),
  ];

  expect(buildInlineActionableIssuePresentations(blockers)).toEqual([
    expect.objectContaining({
      title: '本题尚未完成',
      sourceIssues: blockers,
    }),
  ]);
  expect(buildInlineActionableIssuePresentations(warnings)).toEqual([
    expect.objectContaining({
      title: '仍保留历史缺失原因',
      sourceIssues: warnings,
    }),
  ]);
});

test('inline presentations omit repeated item identity but retain actionable metadata', () => {
  const issue: ScaleSubmissionIssue = {
    ...createIssue({
      code: 'ITEM_REQUIRED_STEP_MISSING',
      severity: 'blocking',
      itemResponseId: 'item-a',
      itemCode: 'CONFIG_DRIVEN_ITEM',
    }),
    itemOrder: 7,
    itemTitle: 'Configured item',
    crfCode: 'CRF.7',
    groupCode: 'group-a',
    missingStepCodes: ['step-a'],
  };
  const [presentation] = buildInlineActionableIssuePresentations([issue]);

  expect(presentation?.details).toEqual(['缺少分步编码：step-a']);
});
