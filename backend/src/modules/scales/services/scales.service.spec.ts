// backend/src/modules/scales/services/scales.service.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  ScaleDefinition,
  ScaleDefinitionSchema,
} from '../schemas/scale-definition.schema';
import {
  ScaleVersion,
  ScaleVersionSchema,
} from '../schemas/scale-version.schema';
import { ScalesService } from './scales.service';

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('Scale schemas', () => {
  it('defines ScaleDefinition collection and indexes', () => {
    expect(ScaleDefinitionSchema.get('collection')).toBe('scale_definitions');
    expect(ScaleDefinitionSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ code: 1 }, expect.objectContaining({ unique: true })],
        [{ status: 1, sortOrder: 1 }, expect.any(Object)],
      ]),
    );
  });

  it('defines ScaleDefinition explicit primitive and ObjectId field types', () => {
    expect(ScaleDefinitionSchema.path('category')?.instance).toBe('String');
    expect(ScaleDefinitionSchema.path('status')?.instance).toBe('String');
    expect(ScaleDefinitionSchema.path('currentVersionId')?.instance).toBe(
      'ObjectId',
    );
  });

  it('defines ScaleVersion collection and indexes', () => {
    expect(ScaleVersionSchema.get('collection')).toBe('scale_versions');
    expect(ScaleVersionSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { scaleDefinitionId: 1, version: 1 },
          expect.objectContaining({ unique: true }),
        ],
        [{ scaleCode: 1, version: 1 }, expect.any(Object)],
        [{ scaleCode: 1, status: 1 }, expect.any(Object)],
      ]),
    );
  });

  it('defines ScaleVersion explicit primitive, nullable and Mixed field types', () => {
    expect(ScaleVersionSchema.path('scaleDefinitionId')?.instance).toBe(
      'ObjectId',
    );
    expect(ScaleVersionSchema.path('status')?.instance).toBe('String');
    expect(ScaleVersionSchema.path('effectiveFrom')?.instance).toBe('Date');
    expect(ScaleVersionSchema.path('retiredAt')?.instance).toBe('Date');
    expect(ScaleVersionSchema.path('qualityControlRules')?.instance).toBe(
      'Mixed',
    );
    expect(ScaleVersionSchema.path('items.responseType')?.instance).toBe(
      'String',
    );
    expect(ScaleVersionSchema.path('items.scoringRule')?.instance).toBe(
      'Mixed',
    );
  });
});

describe('ScalesService', () => {
  let service: ScalesService;
  let definitionModel: {
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let versionModel: {
    findOne: jest.Mock;
  };

  beforeEach(async () => {
    definitionModel = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    versionModel = {
      findOne: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScalesService,
        {
          provide: getModelToken(ScaleDefinition.name),
          useValue: definitionModel,
        },
        {
          provide: getModelToken(ScaleVersion.name),
          useValue: versionModel,
        },
      ],
    }).compile();

    service = moduleRef.get(ScalesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes scale code with trim and lowercase', () => {
    expect(service.normalizeScaleCode('  MMSE  ')).toBe('mmse');
  });

  it('returns null when definition is not found', async () => {
    definitionModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(service.findDefinitionByCode('unknown')).resolves.toBeNull();
    expect(definitionModel.findOne).toHaveBeenCalledWith({
      code: 'unknown',
    });
  });

  it('maps definition results instead of returning raw documents', async () => {
    const definitionId = new Types.ObjectId();
    const currentVersionId = new Types.ObjectId();
    const rawDefinition = {
      _id: definitionId,
      code: 'mmse',
      name: 'Mini-Mental State Examination',
      shortName: 'MMSE',
      description: 'Internal definition base only',
      category: 'cognitive',
      status: 'active',
      currentVersionId,
      sortOrder: 10,
      tags: ['screening'],
      internalMarker: 'not returned',
    };
    definitionModel.findOne.mockReturnValue(createExecQuery(rawDefinition));

    const result = await service.findDefinitionByCode(' MMSE ');

    expect(result).toEqual({
      id: definitionId.toString(),
      code: 'mmse',
      name: 'Mini-Mental State Examination',
      shortName: 'MMSE',
      description: 'Internal definition base only',
      category: 'cognitive',
      status: 'active',
      currentVersionId: currentVersionId.toString(),
      sortOrder: 10,
      tags: ['screening'],
    });
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('internalMarker');
    expect(definitionModel.findOne).toHaveBeenCalledWith({ code: 'mmse' });
  });

  it('returns null when version is not found', async () => {
    versionModel.findOne.mockReturnValue(createExecQuery(null));

    await expect(
      service.findVersionByScaleCodeAndVersion(' MoCA ', ' 1.0 '),
    ).resolves.toBeNull();
    expect(versionModel.findOne).toHaveBeenCalledWith({
      scaleCode: 'moca',
      version: '1.0',
    });
  });

  it('maps version configuration results for internal consumers', async () => {
    const versionId = new Types.ObjectId();
    const definitionId = new Types.ObjectId();
    const effectiveFrom = new Date('2026-01-01T00:00:00.000Z');
    const rawVersion = {
      _id: versionId,
      scaleDefinitionId: definitionId,
      scaleCode: 'moca',
      version: '1.0',
      displayVersion: 'v1.0',
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-1',
      fieldEncodingVersion: 'field-1',
      sourceDocument: 'source-placeholder',
      status: 'active',
      totalScoreRange: { min: 0, max: 30, step: 1 },
      groups: [
        {
          code: 'orientation',
          title: 'Orientation',
          order: 1,
          instruction: 'Read the instruction',
          description: 'Group description',
          cognitiveDomainCodes: ['orientation'],
        },
      ],
      items: [
        {
          code: 'moca.sample.item',
          crfCode: 'N1.sample',
          title: 'Sample item',
          prompt: 'Prompt',
          instruction: 'Instruction',
          order: 1,
          groupCode: 'orientation',
          responseType: 'photo_upload',
          scoreRange: { min: 0, max: 1, step: 1 },
          countsTowardTotal: false,
          cognitiveDomainCodes: ['visuospatial'],
          evidenceTypes: ['photo', 'operator_note'],
          requiresTimer: true,
          supportsPhotoUpload: true,
          supportsHandwriting: false,
          requiresOperatorNote: true,
          scoringRule: { mode: 'manual' },
          qualityControlRule: { requireEvidence: true },
          reportingRule: { showEvidence: true },
          researchExportField: 'moca_sample_item',
        },
      ],
      qualityControlRules: { requireCompleteness: true },
      reportingRules: { showTotalScore: true },
      researchExportMappings: { total: 'moca_total' },
      effectiveFrom,
      retiredAt: null,
      internalMarker: 'not returned',
    };
    versionModel.findOne.mockReturnValue(createExecQuery(rawVersion));

    const result = await service.findVersionByScaleCodeAndVersion(
      ' MoCA ',
      ' 1.0 ',
    );

    expect(result).toEqual({
      id: versionId.toString(),
      scaleDefinitionId: definitionId.toString(),
      scaleCode: 'moca',
      version: '1.0',
      displayVersion: 'v1.0',
      crfVersion: 'crf-1',
      scoringRuleVersion: 'score-1',
      fieldEncodingVersion: 'field-1',
      sourceDocument: 'source-placeholder',
      status: 'active',
      totalScoreRange: { min: 0, max: 30, step: 1 },
      groups: [
        {
          code: 'orientation',
          title: 'Orientation',
          order: 1,
          instruction: 'Read the instruction',
          description: 'Group description',
          cognitiveDomainCodes: ['orientation'],
        },
      ],
      items: [
        {
          code: 'moca.sample.item',
          crfCode: 'N1.sample',
          title: 'Sample item',
          prompt: 'Prompt',
          instruction: 'Instruction',
          order: 1,
          groupCode: 'orientation',
          responseType: 'photo_upload',
          scoreRange: { min: 0, max: 1, step: 1 },
          countsTowardTotal: false,
          cognitiveDomainCodes: ['visuospatial'],
          evidenceTypes: ['photo', 'operator_note'],
          requiresTimer: true,
          supportsPhotoUpload: true,
          supportsHandwriting: false,
          requiresOperatorNote: true,
          scoringRule: { mode: 'manual' },
          qualityControlRule: { requireEvidence: true },
          reportingRule: { showEvidence: true },
          researchExportField: 'moca_sample_item',
        },
      ],
      qualityControlRules: { requireCompleteness: true },
      reportingRules: { showTotalScore: true },
      researchExportMappings: { total: 'moca_total' },
      effectiveFrom,
      retiredAt: null,
    });
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('internalMarker');
  });

  it('lists active definitions through mapper output', async () => {
    const definitionId = new Types.ObjectId();
    const sort = jest.fn().mockReturnValue(
      createExecQuery([
        {
          _id: definitionId,
          code: 'iadl',
          name: 'Instrumental Activities of Daily Living',
          category: 'cognitive',
          status: 'active',
          currentVersionId: null,
          sortOrder: 20,
          tags: [],
          internalMarker: 'not returned',
        },
      ]),
    );
    definitionModel.find.mockReturnValue({ sort });

    const result = await service.listActiveDefinitions();

    expect(definitionModel.find).toHaveBeenCalledWith({ status: 'active' });
    expect(sort).toHaveBeenCalledWith({ sortOrder: 1, code: 1 });
    expect(result).toEqual([
      {
        id: definitionId.toString(),
        code: 'iadl',
        name: 'Instrumental Activities of Daily Living',
        shortName: undefined,
        description: undefined,
        category: 'cognitive',
        status: 'active',
        currentVersionId: null,
        sortOrder: 20,
        tags: [],
      },
    ]);
    expect(result[0]).not.toHaveProperty('internalMarker');
  });
});
