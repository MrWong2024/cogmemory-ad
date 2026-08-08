// backend/src/modules/scales/seeds/scale-seed-data.service.spec.ts
import {
  ScaleSeedDataService,
  validateScaleSeeds,
} from './scale-seed-data.service';
import type { ScaleSeedData, ScaleSeedItem } from './scale-seed.types';

describe('ScaleSeedDataService', () => {
  let service: ScaleSeedDataService;

  beforeEach(() => {
    service = new ScaleSeedDataService();
  });

  it('returns MMSE and MoCA from getAllScaleSeeds()', () => {
    const seeds = service.getAllScaleSeeds();

    expect(seeds.map((seed) => seed.definition.code).sort()).toEqual([
      'mmse',
      'moca',
    ]);
  });

  it('normalizes scale code with trim and lowercase in getScaleSeedByCode()', () => {
    const seed = service.getScaleSeedByCode('  MoCA  ');

    expect(seed?.definition.code).toBe('moca');
  });

  it('returns null when getScaleSeedByCode() does not find a seed', () => {
    expect(service.getScaleSeedByCode('unknown')).toBeNull();
  });

  it('returns MMSE and MoCA 1.0 version seeds', () => {
    expect(service.getScaleVersionSeed(' MMSE ', ' 1.0 ')?.version).toBe('1.0');
    expect(service.getScaleVersionSeed(' moca ', ' 1.0 ')?.version).toBe('1.0');
  });

  it('lists seed scale definitions', () => {
    const definitions = service.listSeedScaleDefinitions();

    expect(definitions).toHaveLength(2);
    expect(definitions.map((definition) => definition.code).sort()).toEqual([
      'mmse',
      'moca',
    ]);
  });

  it('lists seed scale versions', () => {
    const versions = service.listSeedScaleVersions();

    expect(versions).toHaveLength(2);
    expect(versions.map((version) => version.scaleCode).sort()).toEqual([
      'mmse',
      'moca',
    ]);
  });

  it('keeps built-in seeds valid', () => {
    const result = service.validateScaleSeeds();

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('configures the MMSE 1.0 patient package as 19 contiguous safe steps', () => {
    const mmse = getSeed(service.getAllScaleSeeds(), 'mmse');
    const steps = getPatientAdministrationSteps(mmse);

    expect(mmse.version.presentationPackageKey).toBe('mmse-1.0-package-001');
    expect(steps).toHaveLength(19);
    expect(steps.map((step) => step.order)).toEqual(
      Array.from({ length: 19 }, (_, index) => index + 1),
    );
    expect(steps.map((step) => step.stepKey)).toEqual([
      'mmse-orientation-year',
      'mmse-orientation-season',
      'mmse-orientation-month',
      'mmse-orientation-date',
      'mmse-orientation-weekday',
      'mmse-orientation-city',
      'mmse-orientation-district',
      'mmse-orientation-street',
      'mmse-orientation-floor',
      'mmse-orientation-place',
      'mmse-immediate-recall',
      'mmse-attention-calculation',
      'mmse-delayed-recall',
      'mmse-naming',
      'mmse-repetition',
      'mmse-reading-command',
      'mmse-three-step-command',
      'mmse-expression',
      'mmse-drawing',
    ]);

    const itemCodes = new Set(mmse.version.items.map((item) => item.code));
    expect(steps.every((step) => itemCodes.has(step.itemCode))).toBe(true);
    const referencedAssets = steps.flatMap((step) => step.assetKeys);
    expect(referencedAssets).toHaveLength(22);
    expect(new Set(referencedAssets).size).toBe(22);
  });

  it('keeps the MMSE reading step visual-only, staff-observed, and patient-advanced', () => {
    const mmse = getSeed(service.getAllScaleSeeds(), 'mmse');
    const readingStep = getPatientAdministrationSteps(mmse).find(
      (step) => step.stepKey === 'mmse-reading-command',
    );

    expect(readingStep).toEqual({
      stepKey: 'mmse-reading-command',
      order: 16,
      itemCode: 'mmse.language.reading_command',
      patientText: '请闭上您的眼睛',
      assetKeys: [],
      responseMode: 'staff_observation',
      advanceBy: 'patient',
    });
  });

  it('keeps MoCA valid without patient presentation configuration', () => {
    const seeds = service.getAllScaleSeeds();
    const moca = getSeed(seeds, 'moca');

    expect(moca.version.presentationPackageKey).toBeUndefined();
    expect(moca.version.patientAdministrationSteps).toBeUndefined();
    expect(validateScaleSeeds(seeds).valid).toBe(true);
  });

  it('requires packageKey and patient steps to be present together', () => {
    const seeds = service.getAllScaleSeeds();
    const mmse = getSeed(seeds, 'mmse');
    delete mmse.version.presentationPackageKey;

    expectValidationIssue(
      validateScaleSeeds(seeds),
      'patient_administration_config_incomplete',
    );
  });

  it.each([
    {
      name: 'duplicate stepKey',
      issueCode: 'patient_administration_step_key_duplicate',
      mutate: (seed: ScaleSeedData) => {
        const steps = getPatientAdministrationSteps(seed);
        steps[1].stepKey = steps[0].stepKey;
      },
    },
    {
      name: 'non-contiguous order',
      issueCode: 'patient_administration_order_not_contiguous',
      mutate: (seed: ScaleSeedData) => {
        getPatientAdministrationSteps(seed)[18].order = 20;
      },
    },
    {
      name: 'duplicate order',
      issueCode: 'patient_administration_order_duplicate',
      mutate: (seed: ScaleSeedData) => {
        const steps = getPatientAdministrationSteps(seed);
        steps[1].order = steps[0].order;
      },
    },
    {
      name: 'empty stepKey',
      issueCode: 'patient_administration_step_key_empty',
      mutate: (seed: ScaleSeedData) => {
        getPatientAdministrationSteps(seed)[0].stepKey = '   ';
      },
    },
    {
      name: 'non-positive order',
      issueCode: 'patient_administration_order_invalid',
      mutate: (seed: ScaleSeedData) => {
        getPatientAdministrationSteps(seed)[0].order = 0;
      },
    },
    {
      name: 'unknown itemCode',
      issueCode: 'patient_administration_item_missing',
      mutate: (seed: ScaleSeedData) => {
        getPatientAdministrationSteps(seed)[0].itemCode = 'mmse.unknown';
      },
    },
    {
      name: 'invalid responseMode',
      issueCode: 'patient_administration_response_mode_invalid',
      mutate: (seed: ScaleSeedData) => {
        const step = getPatientAdministrationSteps(
          seed,
        )[0] as unknown as Record<string, unknown>;
        step.responseMode = 'video';
      },
    },
    {
      name: 'invalid advanceBy',
      issueCode: 'patient_administration_advance_by_invalid',
      mutate: (seed: ScaleSeedData) => {
        const step = getPatientAdministrationSteps(
          seed,
        )[0] as unknown as Record<string, unknown>;
        step.advanceBy = 'system';
      },
    },
    {
      name: 'duplicate assetKey',
      issueCode: 'patient_administration_asset_key_duplicate',
      mutate: (seed: ScaleSeedData) => {
        const step = getPatientAdministrationSteps(seed)[0];
        step.assetKeys = [step.assetKeys[0], step.assetKeys[0]];
      },
    },
    {
      name: 'non-string assetKey',
      issueCode: 'patient_administration_asset_keys_invalid',
      mutate: (seed: ScaleSeedData) => {
        const step = getPatientAdministrationSteps(
          seed,
        )[0] as unknown as Record<string, unknown>;
        step.assetKeys = [123];
      },
    },
    {
      name: 'empty patientText',
      issueCode: 'patient_administration_patient_text_empty',
      mutate: (seed: ScaleSeedData) => {
        getPatientAdministrationSteps(seed)[0].patientText = '   ';
      },
    },
  ])('rejects patient presentation $name', ({ issueCode, mutate }) => {
    const seeds = service.getAllScaleSeeds();
    mutate(getSeed(seeds, 'mmse'));

    expectValidationIssue(validateScaleSeeds(seeds), issueCode);
  });

  it('rejects explicit scoring answers in patientText', () => {
    const seeds = service.getAllScaleSeeds();
    const mmse = getSeed(seeds, 'mmse');
    const step = getPatientAdministrationSteps(mmse).find(
      (candidate) => candidate.stepKey === 'mmse-attention-calculation',
    );

    if (!step) {
      throw new Error('Expected MMSE attention step');
    }
    step.patientText = '正确答案是 93。';

    expectValidationIssue(
      validateScaleSeeds(seeds),
      'patient_administration_scoring_answer_leak',
    );
  });

  it('rejects audio or changed text on the MMSE reading step', () => {
    const seeds = service.getAllScaleSeeds();
    const mmse = getSeed(seeds, 'mmse');
    const readingStep = getPatientAdministrationSteps(mmse).find(
      (step) => step.stepKey === 'mmse-reading-command',
    );

    if (!readingStep) {
      throw new Error('Expected MMSE reading step');
    }
    readingStep.patientText = '请闭上你的眼睛';
    readingStep.assetKeys = ['mmse-reading-guidance'];
    readingStep.responseMode = 'speech';

    const result = validateScaleSeeds(seeds);
    expectValidationIssue(result, 'mmse_reading_patient_text_invalid');
    expectValidationIssue(result, 'mmse_reading_asset_keys_invalid');
    expectValidationIssue(result, 'mmse_reading_response_mode_invalid');
  });

  it('keeps MMSE total score range at 0-30', () => {
    const mmse = getSeed(service.getAllScaleSeeds(), 'mmse');

    expect(mmse.version.totalScoreRange).toEqual({
      min: 0,
      max: 30,
      step: 1,
    });
  });

  it('keeps MoCA total score range at 0-30', () => {
    const moca = getSeed(service.getAllScaleSeeds(), 'moca');

    expect(moca.version.totalScoreRange).toEqual({
      min: 0,
      max: 30,
      step: 1,
    });
  });

  it('uses corrected MMSE writing sentence code and item number', () => {
    const mmse = getSeed(service.getAllScaleSeeds(), 'mmse');
    const item = getItem(mmse, 'mmse.language.writing_sentence');

    expect(item.crfCode).toBe('MMSE.9');
    expect(item.evidenceTypes).toEqual(
      expect.arrayContaining([
        'raw_text',
        'photo',
        'handwriting',
        'operator_note',
      ]),
    );
    expect(item.supportsPhotoUpload).toBe(true);
    expect(item.supportsHandwriting).toBe(true);
    expect(getRecord(item.qualityControlRule).correction).toEqual(
      expect.stringContaining('系统修正为第 9 项'),
    );
  });

  it('uses corrected MMSE copy drawing code and evidence requirements', () => {
    const mmse = getSeed(service.getAllScaleSeeds(), 'mmse');
    const item = getItem(mmse, 'mmse.visuospatial.copy_drawing');

    expect(item.crfCode).toBe('MMSE.10');
    expect(item.responseType).toBe('drawing');
    expect(item.evidenceTypes).toEqual(
      expect.arrayContaining(['photo', 'handwriting', 'operator_note']),
    );
    expect(item.supportsPhotoUpload).toBe(true);
    expect(item.supportsHandwriting).toBe(true);
  });

  it('uses corrected MoCA abstraction CRF codes', () => {
    const moca = getSeed(service.getAllScaleSeeds(), 'moca');

    expect(getItem(moca, 'moca.abstraction.train_bicycle').crfCode).toBe(
      'N1.2.12.1',
    );
    expect(getItem(moca, 'moca.abstraction.watch_scale').crfCode).toBe(
      'N1.2.12.2',
    );
    expect(
      moca.version.items.filter((item) =>
        ['N1.2.11.1', 'N1.2.11.2'].includes(item.crfCode ?? ''),
      ),
    ).toEqual([]);
  });

  it('keeps MoCA immediate memory trials as non-scored raw records', () => {
    const moca = getSeed(service.getAllScaleSeeds(), 'moca');
    const trial1 = getItem(moca, 'moca.memory.immediate.trial_1');
    const trial2 = getItem(moca, 'moca.memory.immediate.trial_2');

    for (const trial of [trial1, trial2]) {
      expect(trial.countsTowardTotal).toBe(false);
      expect(trial.scoreRange).toEqual({ min: 0, max: 0, step: 1 });
      expect(trial.evidenceTypes).toEqual(
        expect.arrayContaining(['raw_text', 'operator_note']),
      );
      expect(trial.scoringRule).toEqual(
        expect.objectContaining({
          mode: 'raw_record_only',
          preserveRawRecord: true,
        }),
      );
    }
  });

  it('keeps MoCA delayed recall free recall scoring and prompt records', () => {
    const moca = getSeed(service.getAllScaleSeeds(), 'moca');
    const item = getItem(moca, 'moca.memory.delayed_recall');
    const promptRecords = getRuleArray(item, 'promptRecords');

    expect(item.countsTowardTotal).toBe(true);
    expect(item.scoreRange).toEqual({ min: 0, max: 5, step: 1 });
    expect(getRuleValue(item, 'scoreSource')).toBe('free_recall_only');
    expect(promptRecords).toHaveLength(5);
    expect(getRecord(promptRecords[0])).toEqual(
      expect.objectContaining({
        freeRecallScoreField: 'freeRecall',
        categoryCueRecordField: 'categoryCue',
        multipleChoiceCueRecordField: 'multipleChoiceCue',
      }),
    );
  });

  it('keeps MMSE serial sevens as five independent steps', () => {
    const mmse = getSeed(service.getAllScaleSeeds(), 'mmse');
    const item = getItem(mmse, 'mmse.attention.serial_sevens');

    expect(getExpectedSteps(item)).toEqual([93, 86, 79, 72, 65]);
    expect(getRuleValue(item, 'independentStepScoring')).toBe(true);
    expect(getRuleValue(item, 'scoringSummary')).toEqual(
      expect.stringContaining('每一步独立计分'),
    );
  });

  it('keeps MoCA serial sevens as independent steps with 0-3 aggregation', () => {
    const moca = getSeed(service.getAllScaleSeeds(), 'moca');
    const item = getItem(moca, 'moca.attention.serial_sevens');

    expect(getExpectedSteps(item)).toEqual([93, 86, 79, 72, 65]);
    expect(getRuleValue(item, 'independentStepScoring')).toBe(true);
    expect(getRuleValue(item, 'scoringSummary')).toEqual(
      expect.stringContaining('0 个正确 0 分'),
    );
    expect(getRuleArray(item, 'aggregationRule')).toHaveLength(4);
  });

  it('keeps MoCA drawing evidence and trail making timer requirements', () => {
    const moca = getSeed(service.getAllScaleSeeds(), 'moca');
    const trail = getItem(moca, 'moca.visuospatial.trail_making');
    const cube = getItem(moca, 'moca.visuospatial.cube');
    const clock = getItem(moca, 'moca.visuospatial.clock');

    expect(trail.requiresTimer).toBe(true);
    expect(trail.evidenceTypes).toEqual(
      expect.arrayContaining(['photo', 'handwriting', 'duration']),
    );

    for (const item of [trail, cube, clock]) {
      expect(item.supportsPhotoUpload).toBe(true);
      expect(item.supportsHandwriting).toBe(true);
      expect(item.evidenceTypes).toEqual(
        expect.arrayContaining(['photo', 'handwriting']),
      );
    }
  });

  it('keeps all item codes unique', () => {
    const items = service
      .getAllScaleSeeds()
      .flatMap((seed) => seed.version.items);
    const uniqueCodes = new Set(items.map((item) => item.code));

    expect(uniqueCodes.size).toBe(items.length);
  });

  it('keeps all groupCode references resolvable', () => {
    const seeds = service.getAllScaleSeeds();

    for (const seed of seeds) {
      const groupCodes = new Set(
        seed.version.groups.map((group) => group.code),
      );
      for (const item of seed.version.items) {
        expect(groupCodes.has(item.groupCode ?? '')).toBe(true);
      }
    }
  });

  it('detects duplicate item code', () => {
    const seeds = service.getAllScaleSeeds();
    const mmse = getSeed(seeds, 'mmse');
    mmse.version.items[1].code = mmse.version.items[0].code;

    const result = validateScaleSeeds(seeds);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('duplicate item code')]),
    );
  });

  it('detects invalid groupCode reference', () => {
    const seeds = service.getAllScaleSeeds();
    const mmse = getSeed(seeds, 'mmse');
    getItem(mmse, 'mmse.language.naming').groupCode = 'missing_group';

    const result = validateScaleSeeds(seeds);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('references missing groupCode'),
      ]),
    );
  });

  it('detects invalid scoreRange', () => {
    const seeds = service.getAllScaleSeeds();
    const mmse = getSeed(seeds, 'mmse');
    getItem(mmse, 'mmse.language.naming').scoreRange = {
      min: 2,
      max: 1,
      step: 1,
    };

    const result = validateScaleSeeds(seeds);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'scoreRange max must be greater than or equal to min',
        ),
      ]),
    );
  });

  it('detects legacy MoCA abstraction CRF code', () => {
    const seeds = service.getAllScaleSeeds();
    const moca = getSeed(seeds, 'moca');
    getItem(moca, 'moca.abstraction.train_bicycle').crfCode = 'N1.2.11.1';

    const result = validateScaleSeeds(seeds);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('must use CRF code N1.2.12.1'),
        expect.stringContaining('must not use legacy CRF code N1.2.11.1'),
      ]),
    );
  });
});

function getSeed(seeds: ScaleSeedData[], scaleCode: string): ScaleSeedData {
  const seed = seeds.find((item) => item.definition.code === scaleCode);

  if (!seed) {
    throw new Error(`Expected scale seed ${scaleCode}`);
  }

  return seed;
}

function getItem(seed: ScaleSeedData, itemCode: string): ScaleSeedItem {
  const item = seed.version.items.find(
    (candidate) => candidate.code === itemCode,
  );

  if (!item) {
    throw new Error(`Expected item ${itemCode}`);
  }

  return item;
}

function getPatientAdministrationSteps(seed: ScaleSeedData) {
  const steps = seed.version.patientAdministrationSteps;

  if (!steps) {
    throw new Error(
      `Expected patient administration steps for ${seed.definition.code}`,
    );
  }

  return steps;
}

function expectValidationIssue(
  result: ReturnType<typeof validateScaleSeeds>,
  issueCode: string,
): void {
  expect(result.valid).toBe(false);
  expect(result.issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: issueCode })]),
  );
}

function getRuleArray(item: ScaleSeedItem, propertyName: string): unknown[] {
  const value = getRuleValue(item, propertyName);

  if (!Array.isArray(value)) {
    throw new Error(`Expected ${item.code}.${propertyName} to be an array`);
  }

  return value;
}

function getExpectedSteps(item: ScaleSeedItem): number[] {
  return getRuleArray(item, 'steps').map((step) => {
    const record = getRecord(step);
    const expected = record.expected;

    if (typeof expected !== 'number') {
      throw new Error(
        `Expected ${item.code} step expected value to be numeric`,
      );
    }

    return expected;
  });
}

function getRuleValue(item: ScaleSeedItem, propertyName: string): unknown {
  const rule = item.scoringRule;

  if (!rule) {
    throw new Error(`Expected scoringRule for ${item.code}`);
  }

  return rule[propertyName];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Expected record value');
  }

  return value;
}
