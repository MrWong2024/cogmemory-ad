import { expect, test } from '@playwright/test';

import {
  getInlineSubmissionIssueSnapshotLabel,
  routeScaleSubmissionIssues,
} from '@/src/features/assessments/lib/scale-submission-issue-routing';
import { buildInlineActionableIssuePresentations } from '@/src/features/assessments/lib/scale-submission-inline-presentation';
import { getScaleSubmissionIssueDisplay } from '@/src/features/assessments/lib/scale-instance-submission-display';
import { getScaleExecutionProgressiveDisclosure } from '@/src/features/assessments/lib/assessment-execution-display';
import {
  getFormalMediaEvidenceIds,
  selectFormalMediaEvidences,
} from '@/src/features/assessments/lib/media-evidence-display';
import { routePatientReviewReferences } from '@/src/features/patient-administration/lib/patient-review-reference-routing';
import {
  formatPatientAdministrationReviewDimensions,
  formatPatientAdministrationReviewFileSize,
  formatPatientAdministrationReviewFileType,
  getPatientAdministrationReviewEvidenceStatusLabel,
} from '@/src/features/patient-administration/lib/patient-administration-review-display';
import type {
  ScaleSubmissionIssue,
  ScaleSubmissionIssueSeverity,
  ScaleSubmissionIssueScope,
} from '@/src/features/assessments/types/scale-instance-submission';
import type { ItemEvidenceRequirement } from '@/src/features/assessments/types/item-response-execution';
import type {
  MediaEvidence,
  MediaEvidenceStatus,
} from '@/src/features/assessments/types/media-evidence';
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

function createMediaEvidence(
  id: string,
  status: MediaEvidenceStatus = 'attached',
): MediaEvidence {
  return {
    id,
    evidenceCode: `EVD-${id}`,
    evidenceType: 'handwriting',
    captureMode: 'tablet_handwriting',
    status,
    storageStatus: 'stored',
    itemCode: 'mmse.visuospatial.copy_drawing',
    file: null,
    imageMetadata: null,
    handwritingTrace: null,
    captureContext: null,
    operatorSnapshot: null,
    audioMetadata: null,
    transcription: null,
    qualityStatus: 'unchecked',
    lockedAt: status === 'locked' ? '2026-08-20T00:00:00.000Z' : null,
    voidedAt: status === 'voided' ? '2026-08-20T00:00:00.000Z' : null,
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  };
}

function createHandwritingRequirement(
  status: ItemEvidenceRequirement['status'],
  attached: boolean,
  mediaEvidenceId: string | null,
): ItemEvidenceRequirement {
  return {
    evidenceType: 'handwriting',
    status,
    attached,
    mediaEvidenceId,
  };
}

test('selects only the exact formal evidence reference and keeps locked formal evidence visible', () => {
  const patientRaw = createMediaEvidence('patient-raw');
  const formal = createMediaEvidence('formal', 'locked');
  const oldVoided = createMediaEvidence('old-voided', 'voided');
  const formalIds = getFormalMediaEvidenceIds([
    createHandwritingRequirement('attached', true, formal.id),
  ]);

  expect(
    selectFormalMediaEvidences(formalIds, [patientRaw, formal, oldVoided]).map(
      (item) => item.id,
    ),
  ).toEqual([formal.id]);
});

test('does not treat an attached same-type media record as formal evidence', () => {
  const patientRaw = createMediaEvidence('patient-raw');
  const formalIds = getFormalMediaEvidenceIds([
    createHandwritingRequirement('missing', false, null),
  ]);

  expect(selectFormalMediaEvidences(formalIds, [patientRaw])).toEqual([]);
});

test('follows authoritative adoption and void requirement transitions without reloading media history', () => {
  const patientRaw = createMediaEvidence('patient-raw');
  const items = [patientRaw];

  expect(
    selectFormalMediaEvidences(
      getFormalMediaEvidenceIds([
        createHandwritingRequirement('missing', false, null),
      ]),
      items,
    ),
  ).toEqual([]);
  expect(
    selectFormalMediaEvidences(
      getFormalMediaEvidenceIds([
        createHandwritingRequirement('attached', true, patientRaw.id),
      ]),
      items,
    ).map((item) => item.id),
  ).toEqual([patientRaw.id]);
  expect(
    selectFormalMediaEvidences(
      getFormalMediaEvidenceIds([
        createHandwritingRequirement('missing', false, patientRaw.id),
      ]),
      items,
    ),
  ).toEqual([]);
});

test('fails closed when the formal reference is absent from media history', () => {
  const sameTypeFallback = createMediaEvidence('same-type-fallback');
  const formalIds = getFormalMediaEvidenceIds([
    createHandwritingRequirement('attached', true, 'missing-formal-id'),
  ]);

  expect([...formalIds]).toEqual(['missing-formal-id']);
  expect(selectFormalMediaEvidences(formalIds, [sameTypeFallback])).toEqual([]);
});

test('keeps every non-completed supervised MMSE session in the patient administration phase', () => {
  for (const patientAdministrationStatus of [
    null,
    'prepared',
    'active',
    'paused',
    'terminated',
    'expired',
  ] as const) {
    const disclosure = getScaleExecutionProgressiveDisclosure({
      scaleCode: 'mmse',
      administrationMode: 'supervised_patient_input',
      patientAdministrationStatus,
      scaleInstanceStatus: 'completed',
      scoreResultStatus: 'confirmed',
    });

    expect(disclosure).toEqual({
      isSupervisedPatientFlow: true,
      isSupervisedPreReview: true,
      isCompletedSupervisedReview: false,
      showFormalWorkspace: false,
      showSubmission: false,
      shouldLoadSubmissionReadiness: false,
      showScoring: false,
      showCognitiveDomain: false,
    });
  }
});

test('opens completed supervised review before later scoring and cognitive-domain phases', () => {
  const review = getScaleExecutionProgressiveDisclosure({
    scaleCode: 'mmse',
    administrationMode: 'supervised_patient_input',
    patientAdministrationStatus: 'completed',
    scaleInstanceStatus: 'in_progress',
    scoreResultStatus: 'draft',
  });
  expect(review).toEqual(
    expect.objectContaining({
      isSupervisedPreReview: false,
      isCompletedSupervisedReview: true,
      showFormalWorkspace: true,
      showSubmission: true,
      shouldLoadSubmissionReadiness: true,
      showScoring: false,
      showCognitiveDomain: false,
    }),
  );

  const scoring = getScaleExecutionProgressiveDisclosure({
    scaleCode: 'mmse',
    administrationMode: 'supervised_patient_input',
    patientAdministrationStatus: 'completed',
    scaleInstanceStatus: 'completed',
    scoreResultStatus: 'needs_review',
  });
  expect(scoring.showScoring).toBe(true);
  expect(scoring.showCognitiveDomain).toBe(false);

  for (const scoreResultStatus of ['confirmed', 'locked', 'voided'] as const) {
    expect(
      getScaleExecutionProgressiveDisclosure({
        scaleCode: 'mmse',
        administrationMode: 'supervised_patient_input',
        patientAdministrationStatus: 'completed',
        scaleInstanceStatus: 'completed',
        scoreResultStatus,
      }).showCognitiveDomain,
    ).toBe(true);
  }

  for (const scoreResultStatus of [
    'draft',
    'computed',
    'needs_review',
  ] as const) {
    expect(
      getScaleExecutionProgressiveDisclosure({
        scaleCode: 'mmse',
        administrationMode: 'supervised_patient_input',
        patientAdministrationStatus: 'completed',
        scaleInstanceStatus: 'completed',
        scoreResultStatus,
      }).showCognitiveDomain,
    ).toBe(false);
  }
});

test('preserves the clinician workspace while progressively disclosing later phases', () => {
  const execution = getScaleExecutionProgressiveDisclosure({
    scaleCode: 'mmse',
    administrationMode: 'clinician_administered',
    patientAdministrationStatus: null,
    scaleInstanceStatus: 'in_progress',
    scoreResultStatus: 'computed',
  });
  expect(execution).toEqual(
    expect.objectContaining({
      isSupervisedPatientFlow: false,
      showFormalWorkspace: true,
      showSubmission: true,
      shouldLoadSubmissionReadiness: true,
      showScoring: false,
      showCognitiveDomain: false,
    }),
  );

  for (const scaleInstanceStatus of [
    'completed',
    'locked',
    'voided',
  ] as const) {
    const history = getScaleExecutionProgressiveDisclosure({
      scaleCode: 'mmse',
      administrationMode: 'clinician_administered',
      patientAdministrationStatus: null,
      scaleInstanceStatus,
      scoreResultStatus: 'locked',
    });
    expect(history.showScoring).toBe(true);
    expect(history.showCognitiveDomain).toBe(true);
  }

  const unsupportedMocaSupervised = getScaleExecutionProgressiveDisclosure({
    scaleCode: 'moca',
    administrationMode: 'supervised_patient_input',
    patientAdministrationStatus: null,
    scaleInstanceStatus: 'in_progress',
    scoreResultStatus: null,
  });
  expect(unsupportedMocaSupervised.isSupervisedPatientFlow).toBe(false);
  expect(unsupportedMocaSupervised.showFormalWorkspace).toBe(true);
  expect(unsupportedMocaSupervised.showSubmission).toBe(true);
});

test('shows the patient administration readiness blocker as a global issue', () => {
  const issue = createIssue({
    code: 'SCALE_INSTANCE_PATIENT_ADMINISTRATION_INCOMPLETE',
    severity: 'blocking',
    scope: 'scale_instance',
  });
  const routing = routeScaleSubmissionIssues(
    { blockingIssues: [issue], warnings: [] },
    [{ id: 'item-a', itemCode: 'CODE_A' }],
  );

  expect(routing.globalBlockingIssues).toEqual([issue]);
  expect(getScaleSubmissionIssueDisplay(issue.code)).toEqual({
    title: '患者施测尚未完成',
    description: '请先完成患者施测，再进入医护复核和量表提交。',
  });
});

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

test('maps review evidence metadata and storage state to compact business labels', () => {
  expect(
    getPatientAdministrationReviewEvidenceStatusLabel({
      status: 'attached',
      storageStatus: 'stored',
    }),
  ).toBe('已保存');
  expect(
    getPatientAdministrationReviewEvidenceStatusLabel({
      status: 'locked',
      storageStatus: 'stored',
    }),
  ).toBe('已保存');
  expect(
    getPatientAdministrationReviewEvidenceStatusLabel({
      status: 'attached',
      storageStatus: 'missing',
    }),
  ).toBe('文件缺失');
  expect(
    getPatientAdministrationReviewEvidenceStatusLabel({
      status: 'voided',
      storageStatus: 'stored',
    }),
  ).toBe('已作废');
  expect(
    getPatientAdministrationReviewEvidenceStatusLabel({
      status: 'deleted',
      storageStatus: 'deleted',
    }),
  ).toBe('已删除');
  expect(
    getPatientAdministrationReviewEvidenceStatusLabel({
      status: 'locked',
      storageStatus: 'pending',
    }),
  ).toBe('待保存');

  expect(
    formatPatientAdministrationReviewFileType({
      mimeType: 'image/png',
      fileExtension: 'png',
      sizeBytes: 4096,
    }),
  ).toBe('PNG（image/png）');
  expect(formatPatientAdministrationReviewFileSize(4096)).toBe('4.0 KB');
  expect(formatPatientAdministrationReviewDimensions(1200, 800)).toBe(
    '1200 × 800 px',
  );
  expect(formatPatientAdministrationReviewDimensions(null, null)).toBe(
    '未记录',
  );
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
