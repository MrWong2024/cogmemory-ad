import { HttpException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ScaleDefinition } from '../schemas/scale-definition.schema';
import { ScaleVersion } from '../schemas/scale-version.schema';
import { ScaleSeedDataService } from '../seeds/scale-seed-data.service';
import { ScaleCatalogService } from './scale-catalog.service';

function createExecQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

async function expectHttpExceptionCode(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  let caughtError: unknown;

  try {
    await promise;
  } catch (error: unknown) {
    caughtError = error;
  }

  expect(caughtError).toBeInstanceOf(HttpException);

  if (!(caughtError instanceof HttpException)) {
    throw caughtError;
  }

  expect(caughtError.getStatus()).toBe(status);
  expect(caughtError.getResponse()).toEqual(expect.objectContaining({ code }));
}

describe('ScaleCatalogService', () => {
  let service: ScaleCatalogService;
  let seedDataService: ScaleSeedDataService;
  let definitionModel: {
    findOneAndUpdate: jest.Mock;
    findOne: jest.Mock;
    updateOne: jest.Mock;
  };
  let versionModel: {
    findOneAndUpdate: jest.Mock;
    findOne: jest.Mock;
  };

  beforeEach(async () => {
    definitionModel = {
      findOneAndUpdate: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn(),
    };
    versionModel = {
      findOneAndUpdate: jest.fn(),
      findOne: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScaleCatalogService,
        ScaleSeedDataService,
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

    service = moduleRef.get(ScaleCatalogService);
    seedDataService = moduleRef.get(ScaleSeedDataService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('returns sorted MMSE and MoCA public summaries without database access', () => {
    const items = service.listAvailableScaleOptions();

    expect(items.map((item) => item.code)).toEqual(['mmse', 'moca']);
    expect(items[0]).toEqual(
      expect.objectContaining({
        code: 'mmse',
        version: '1.0',
        totalScoreRange: { min: 0, max: 30, step: 1 },
        groupCount: 6,
        itemCount: 11,
        capabilities: {
          supportsPhotoUpload: true,
          supportsHandwriting: true,
          requiresTimer: false,
          supportsRawText: true,
          supportsOperatorNote: true,
        },
      }),
    );
    expect(items[1]).toEqual(
      expect.objectContaining({
        code: 'moca',
        groupCount: 8,
        itemCount: 16,
      }),
    );
    expect(items[1].capabilities.requiresTimer).toBe(true);
    expect(items[0]).not.toHaveProperty('groups');
    expect(items[0]).not.toHaveProperty('items');
    expect(items[0]).not.toHaveProperty('scoringRule');
    expect(items[0]).not.toHaveProperty('metadata');
    expect(definitionModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(versionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns stable scale and version not-available semantics', () => {
    expect(() => service.getAvailableScaleOption('unknown')).toThrow(
      HttpException,
    );
    expect(() => service.getAvailableScaleOption('mmse', '9.9')).toThrow(
      HttpException,
    );

    try {
      service.getAvailableScaleOption('unknown');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      if (error instanceof HttpException) {
        expect(error.getResponse()).toEqual(
          expect.objectContaining({ code: 'SCALE_NOT_AVAILABLE' }),
        );
      }
    }

    try {
      service.getAvailableScaleOption('mmse', '9.9');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      if (error instanceof HttpException) {
        expect(error.getResponse()).toEqual(
          expect.objectContaining({ code: 'SCALE_VERSION_NOT_AVAILABLE' }),
        );
      }
    }
  });

  it('hides built-in seed validation details behind SCALE_CATALOG_INVALID', () => {
    jest.spyOn(seedDataService, 'validateScaleSeeds').mockReturnValue({
      valid: false,
      errors: ['internal seed detail'],
      warnings: [],
      issues: [],
    });

    expect(() => service.listAvailableScaleOptions()).toThrow(HttpException);

    try {
      service.listAvailableScaleOptions();
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      if (error instanceof HttpException) {
        expect(error.getStatus()).toBe(500);
        expect(error.getResponse()).toEqual({
          code: 'SCALE_CATALOG_INVALID',
          message: 'Scale catalog is invalid',
        });
      }
    }
  });

  it('materializes a full seed snapshot and initializes currentVersionId safely', async () => {
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const definition = {
      _id: definitionId,
      code: 'mmse',
      status: 'active',
      currentVersionId: null,
    };
    const versionSeed = seedDataService.getScaleVersionSeed('mmse', '1.0');
    const seed = seedDataService.getScaleSeedByCode('mmse');

    if (!versionSeed || !seed) {
      throw new Error('Expected MMSE seed');
    }

    const version = {
      _id: versionId,
      ...structuredClone(versionSeed),
      scaleDefinitionId: definitionId,
    };
    definitionModel.findOneAndUpdate.mockReturnValue(
      createExecQuery(definition),
    );
    versionModel.findOneAndUpdate.mockReturnValue(createExecQuery(version));
    definitionModel.updateOne.mockReturnValue(
      createExecQuery({ modifiedCount: 1 }),
    );

    const result = await service.ensureSeedScaleVersionMaterialized(' MMSE ');

    expect(definitionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { code: 'mmse' },
      {
        $setOnInsert: {
          code: 'mmse',
          name: seed.definition.name,
          shortName: seed.definition.shortName,
          description: seed.definition.description,
          category: seed.definition.category,
          status: 'active',
          currentVersionId: null,
          sortOrder: seed.definition.sortOrder,
          tags: seed.definition.tags,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true,
      },
    );
    expect(versionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { scaleDefinitionId: definitionId, version: '1.0' },
      {
        $setOnInsert: {
          scaleDefinitionId: definitionId,
          scaleCode: 'mmse',
          version: '1.0',
          displayVersion: versionSeed.displayVersion,
          crfVersion: versionSeed.crfVersion,
          scoringRuleVersion: versionSeed.scoringRuleVersion,
          fieldEncodingVersion: versionSeed.fieldEncodingVersion,
          sourceDocument: versionSeed.sourceDocument,
          status: versionSeed.status,
          totalScoreRange: versionSeed.totalScoreRange,
          groups: versionSeed.groups,
          items: versionSeed.items,
          qualityControlRules: versionSeed.qualityControlRules,
          reportingRules: versionSeed.reportingRules,
          researchExportMappings: versionSeed.researchExportMappings,
          effectiveFrom: null,
          retiredAt: null,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true,
      },
    );
    expect(definitionModel.updateOne).toHaveBeenCalledWith(
      {
        _id: definitionId,
        $or: [
          { currentVersionId: null },
          { currentVersionId: { $exists: false } },
        ],
      },
      { $set: { currentVersionId: versionId } },
    );
    expect(result).toEqual(
      expect.objectContaining({
        scaleDefinitionId: definitionId.toString(),
        scaleVersionId: versionId.toString(),
        scaleCode: 'mmse',
        version: '1.0',
      }),
    );
  });

  it('reuses stored records without overwriting clinical configuration', async () => {
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const currentVersionId = new Types.ObjectId();
    const seed = seedDataService.getScaleSeedByCode('moca');

    if (!seed) {
      throw new Error('Expected MoCA seed');
    }

    definitionModel.findOneAndUpdate.mockReturnValue(
      createExecQuery({
        _id: definitionId,
        code: 'moca',
        name: 'Clinical custom name',
        status: 'active',
        currentVersionId,
      }),
    );
    versionModel.findOneAndUpdate.mockReturnValue(
      createExecQuery({
        _id: versionId,
        scaleDefinitionId: definitionId,
        ...structuredClone(seed.version),
      }),
    );
    definitionModel.updateOne.mockReturnValue(
      createExecQuery({ modifiedCount: 0 }),
    );

    await service.ensureSeedScaleVersionMaterialized('moca', '1.0');

    expect(definitionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { code: 'moca' },
      {
        $setOnInsert: {
          code: 'moca',
          name: seed.definition.name,
          shortName: seed.definition.shortName,
          description: seed.definition.description,
          category: seed.definition.category,
          status: seed.definition.status,
          currentVersionId: null,
          sortOrder: seed.definition.sortOrder,
          tags: seed.definition.tags,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true,
      },
    );
    expect(versionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { scaleDefinitionId: definitionId, version: '1.0' },
      {
        $setOnInsert: {
          scaleDefinitionId: definitionId,
          scaleCode: seed.version.scaleCode,
          version: seed.version.version,
          displayVersion: seed.version.displayVersion,
          crfVersion: seed.version.crfVersion,
          scoringRuleVersion: seed.version.scoringRuleVersion,
          fieldEncodingVersion: seed.version.fieldEncodingVersion,
          sourceDocument: seed.version.sourceDocument,
          status: seed.version.status,
          totalScoreRange: seed.version.totalScoreRange,
          groups: seed.version.groups,
          items: seed.version.items,
          qualityControlRules: seed.version.qualityControlRules,
          reportingRules: seed.version.reportingRules,
          researchExportMappings: seed.version.researchExportMappings,
          effectiveFrom: null,
          retiredAt: null,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true,
      },
    );
  });

  it('rejects inactive definitions and inactive versions', async () => {
    const definitionId = new Types.ObjectId();
    const seed = seedDataService.getScaleSeedByCode('mmse');

    if (!seed) {
      throw new Error('Expected MMSE seed');
    }

    definitionModel.findOneAndUpdate.mockReturnValueOnce(
      createExecQuery({
        _id: definitionId,
        code: 'mmse',
        status: 'retired',
      }),
    );
    await expectHttpExceptionCode(
      service.ensureSeedScaleVersionMaterialized('mmse'),
      409,
      'SCALE_NOT_ACTIVE',
    );

    definitionModel.findOneAndUpdate.mockReturnValueOnce(
      createExecQuery({
        _id: definitionId,
        code: 'mmse',
        status: 'active',
      }),
    );
    versionModel.findOneAndUpdate.mockReturnValueOnce(
      createExecQuery({
        _id: new Types.ObjectId(),
        scaleDefinitionId: definitionId,
        ...structuredClone(seed.version),
        status: 'retired',
      }),
    );
    await expectHttpExceptionCode(
      service.ensureSeedScaleVersionMaterialized('mmse'),
      409,
      'SCALE_VERSION_NOT_ACTIVE',
    );
  });

  it('rejects stored version trace and item-count conflicts without overwrite', async () => {
    const definitionId = new Types.ObjectId();
    const seed = seedDataService.getScaleSeedByCode('mmse');

    if (!seed) {
      throw new Error('Expected MMSE seed');
    }

    definitionModel.findOneAndUpdate.mockReturnValue(
      createExecQuery({
        _id: definitionId,
        code: 'mmse',
        status: 'active',
      }),
    );
    versionModel.findOneAndUpdate.mockReturnValue(
      createExecQuery({
        _id: new Types.ObjectId(),
        scaleDefinitionId: definitionId,
        ...structuredClone(seed.version),
        scoringRuleVersion: 'clinical-conflict',
        items: seed.version.items.slice(0, -1),
      }),
    );

    await expectHttpExceptionCode(
      service.ensureSeedScaleVersionMaterialized('mmse'),
      409,
      'SCALE_CATALOG_VERSION_CONFLICT',
    );
    expect(definitionModel.updateOne).not.toHaveBeenCalled();
  });

  it('refetches after a duplicate-key materialization race', async () => {
    const definitionId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const seed = seedDataService.getScaleSeedByCode('moca');

    if (!seed) {
      throw new Error('Expected MoCA seed');
    }

    definitionModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockRejectedValue({ code: 11000 }),
    });
    definitionModel.findOne.mockReturnValue(
      createExecQuery({
        _id: definitionId,
        code: 'moca',
        status: 'active',
      }),
    );
    versionModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockRejectedValue({ code: 11000 }),
    });
    versionModel.findOne.mockReturnValue(
      createExecQuery({
        _id: versionId,
        scaleDefinitionId: definitionId,
        ...structuredClone(seed.version),
      }),
    );
    definitionModel.updateOne.mockReturnValue(
      createExecQuery({ modifiedCount: 1 }),
    );

    const result = await service.ensureSeedScaleVersionMaterialized('moca');

    expect(definitionModel.findOne).toHaveBeenCalledWith({ code: 'moca' });
    expect(versionModel.findOne).toHaveBeenCalledWith({
      scaleDefinitionId: definitionId,
      version: '1.0',
    });
    expect(result.scaleVersionId).toBe(versionId.toString());
  });
});
