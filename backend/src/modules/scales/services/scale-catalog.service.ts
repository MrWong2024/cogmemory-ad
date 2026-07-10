import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ScaleDefinition,
  type ScaleDefinitionDocument,
} from '../schemas/scale-definition.schema';
import {
  ScaleVersion,
  type ScaleVersionDocument,
} from '../schemas/scale-version.schema';
import { ScaleSeedDataService } from '../seeds/scale-seed-data.service';
import type {
  ScaleSeedData,
  ScaleSeedVersion,
} from '../seeds/scale-seed.types';
import type {
  AvailableScaleOptionResponse,
  MaterializedScaleVersionReference,
} from '../types/scale-catalog-response.types';

type MongoDuplicateKeyError = {
  code: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMongoDuplicateKeyError(
  error: unknown,
): error is MongoDuplicateKeyError {
  return isRecord(error) && error.code === 11000;
}

@Injectable()
export class ScaleCatalogService {
  constructor(
    @InjectModel(ScaleDefinition.name)
    private readonly scaleDefinitionModel: Model<ScaleDefinitionDocument>,
    @InjectModel(ScaleVersion.name)
    private readonly scaleVersionModel: Model<ScaleVersionDocument>,
    private readonly scaleSeedDataService: ScaleSeedDataService,
  ) {}

  listAvailableScaleOptions(): AvailableScaleOptionResponse[] {
    const seeds = this.getValidatedSeeds();

    return seeds
      .sort(
        (left, right) =>
          left.definition.sortOrder - right.definition.sortOrder ||
          left.definition.code.localeCompare(right.definition.code),
      )
      .map((seed) => this.toAvailableScaleOption(seed));
  }

  getAvailableScaleOption(
    scaleCode: string,
    scaleVersion?: string,
  ): AvailableScaleOptionResponse {
    const seed = this.getAvailableSeed(scaleCode, scaleVersion);
    return this.toAvailableScaleOption(seed);
  }

  async ensureSeedScaleVersionMaterialized(
    scaleCode: string,
    scaleVersion?: string,
  ): Promise<MaterializedScaleVersionReference> {
    const seed = this.getAvailableSeed(scaleCode, scaleVersion);
    const definition = await this.ensureDefinition(seed);

    if (definition.status !== 'active') {
      throw new ConflictException({
        code: 'SCALE_NOT_ACTIVE',
        message: 'Scale is not active',
      });
    }

    const version = await this.ensureVersion(definition, seed.version);

    if (version.status !== 'active') {
      throw new ConflictException({
        code: 'SCALE_VERSION_NOT_ACTIVE',
        message: 'Scale version is not active',
      });
    }

    this.assertVersionMatchesSeed(version, seed.version);

    await this.scaleDefinitionModel
      .updateOne(
        {
          _id: definition._id,
          $or: [
            { currentVersionId: null },
            { currentVersionId: { $exists: false } },
          ],
        },
        { $set: { currentVersionId: version._id } },
      )
      .exec();

    return {
      scaleDefinitionId: definition._id.toString(),
      scaleVersionId: version._id.toString(),
      scaleCode: seed.definition.code,
      version: seed.version.version,
      option: this.toAvailableScaleOption(seed),
    };
  }

  private getValidatedSeeds(): ScaleSeedData[] {
    const seeds = this.scaleSeedDataService.getAllScaleSeeds();
    const validation = this.scaleSeedDataService.validateScaleSeeds(seeds);

    if (!validation.valid) {
      throw new InternalServerErrorException({
        code: 'SCALE_CATALOG_INVALID',
        message: 'Scale catalog is invalid',
      });
    }

    return seeds;
  }

  private getAvailableSeed(
    scaleCode: string,
    scaleVersion?: string,
  ): ScaleSeedData {
    const seeds = this.getValidatedSeeds();
    const normalizedCode =
      this.scaleSeedDataService.normalizeScaleCode(scaleCode);
    const seed = seeds.find(
      (candidate) =>
        this.scaleSeedDataService.normalizeScaleCode(
          candidate.definition.code,
        ) === normalizedCode,
    );

    if (!seed) {
      throw new NotFoundException({
        code: 'SCALE_NOT_AVAILABLE',
        message: 'Scale is not available',
      });
    }

    const normalizedVersion = scaleVersion?.trim();

    if (normalizedVersion && seed.version.version !== normalizedVersion) {
      throw new NotFoundException({
        code: 'SCALE_VERSION_NOT_AVAILABLE',
        message: 'Scale version is not available',
      });
    }

    return seed;
  }

  private async ensureDefinition(
    seed: ScaleSeedData,
  ): Promise<ScaleDefinitionDocument> {
    const code = this.scaleSeedDataService.normalizeScaleCode(
      seed.definition.code,
    );

    try {
      const definition = await this.scaleDefinitionModel
        .findOneAndUpdate(
          { code },
          {
            $setOnInsert: {
              code,
              name: seed.definition.name,
              shortName: seed.definition.shortName,
              description: seed.definition.description,
              category: seed.definition.category,
              status: seed.definition.status,
              currentVersionId: null,
              sortOrder: seed.definition.sortOrder,
              tags: [...seed.definition.tags],
            },
          },
          {
            upsert: true,
            returnDocument: 'after',
            setDefaultsOnInsert: true,
          },
        )
        .exec();

      if (definition) {
        return definition;
      }
    } catch (error: unknown) {
      if (!isMongoDuplicateKeyError(error)) {
        throw error;
      }
    }

    const definition = await this.scaleDefinitionModel.findOne({ code }).exec();

    if (!definition) {
      throw new InternalServerErrorException({
        code: 'SCALE_CATALOG_INVALID',
        message: 'Scale catalog could not be resolved',
      });
    }

    return definition;
  }

  private async ensureVersion(
    definition: ScaleDefinitionDocument,
    seed: ScaleSeedVersion,
  ): Promise<ScaleVersionDocument> {
    const filter = {
      scaleDefinitionId: definition._id,
      version: seed.version,
    };

    try {
      const version = await this.scaleVersionModel
        .findOneAndUpdate(
          filter,
          {
            $setOnInsert: {
              scaleDefinitionId: definition._id,
              scaleCode: seed.scaleCode,
              version: seed.version,
              displayVersion: seed.displayVersion,
              crfVersion: seed.crfVersion,
              scoringRuleVersion: seed.scoringRuleVersion,
              fieldEncodingVersion: seed.fieldEncodingVersion,
              sourceDocument: seed.sourceDocument,
              status: seed.status,
              totalScoreRange: structuredClone(seed.totalScoreRange),
              groups: structuredClone(seed.groups),
              items: structuredClone(seed.items),
              qualityControlRules: structuredClone(seed.qualityControlRules),
              reportingRules: structuredClone(seed.reportingRules),
              researchExportMappings: structuredClone(
                seed.researchExportMappings,
              ),
              effectiveFrom: null,
              retiredAt: null,
            },
          },
          {
            upsert: true,
            returnDocument: 'after',
            setDefaultsOnInsert: true,
          },
        )
        .exec();

      if (version) {
        return version;
      }
    } catch (error: unknown) {
      if (!isMongoDuplicateKeyError(error)) {
        throw error;
      }
    }

    const version = await this.scaleVersionModel.findOne(filter).exec();

    if (!version) {
      throw new InternalServerErrorException({
        code: 'SCALE_CATALOG_INVALID',
        message: 'Scale catalog version could not be resolved',
      });
    }

    return version;
  }

  private assertVersionMatchesSeed(
    version: ScaleVersionDocument,
    seed: ScaleSeedVersion,
  ): void {
    const conflicts =
      this.scaleSeedDataService.normalizeScaleCode(version.scaleCode) !==
        this.scaleSeedDataService.normalizeScaleCode(seed.scaleCode) ||
      version.version.trim() !== seed.version.trim() ||
      (version.crfVersion ?? null) !== (seed.crfVersion ?? null) ||
      (version.scoringRuleVersion ?? null) !==
        (seed.scoringRuleVersion ?? null) ||
      (version.fieldEncodingVersion ?? null) !==
        (seed.fieldEncodingVersion ?? null) ||
      (version.sourceDocument ?? null) !== (seed.sourceDocument ?? null) ||
      (version.groups?.length ?? 0) !== seed.groups.length ||
      (version.items?.length ?? 0) !== seed.items.length;

    if (conflicts) {
      throw new ConflictException({
        code: 'SCALE_CATALOG_VERSION_CONFLICT',
        message: 'Stored scale version conflicts with the built-in catalog',
      });
    }
  }

  private toAvailableScaleOption(
    seed: ScaleSeedData,
  ): AvailableScaleOptionResponse {
    const items = seed.version.items;

    return {
      code: seed.definition.code,
      name: seed.definition.name,
      shortName: seed.definition.shortName,
      description: seed.definition.description,
      category: seed.definition.category,
      version: seed.version.version,
      displayVersion: seed.version.displayVersion,
      crfVersion: seed.version.crfVersion,
      scoringRuleVersion: seed.version.scoringRuleVersion,
      fieldEncodingVersion: seed.version.fieldEncodingVersion,
      sourceDocument: seed.version.sourceDocument,
      totalScoreRange: structuredClone(seed.version.totalScoreRange),
      groupCount: seed.version.groups.length,
      itemCount: items.length,
      capabilities: {
        supportsPhotoUpload: items.some((item) => item.supportsPhotoUpload),
        supportsHandwriting: items.some((item) => item.supportsHandwriting),
        requiresTimer: items.some((item) => item.requiresTimer),
        supportsRawText: items.some((item) =>
          item.evidenceTypes.includes('raw_text'),
        ),
        supportsOperatorNote: items.some(
          (item) =>
            item.requiresOperatorNote ||
            item.evidenceTypes.includes('operator_note'),
        ),
      },
    };
  }
}
