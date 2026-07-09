// backend/src/modules/scales/services/scales.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ScaleDefinition,
  ScaleDefinitionCategory,
  ScaleDefinitionDocument,
  ScaleStatus,
} from '../schemas/scale-definition.schema';
import {
  ScaleEvidenceType,
  ScaleGroupConfig,
  ScaleItemConfig,
  ScaleResponseType,
  ScaleRuleConfig,
  ScaleScoreRangeConfig,
  ScaleVersion,
  ScaleVersionDocument,
} from '../schemas/scale-version.schema';

export type ScaleDefinitionSummary = {
  id: string;
  code: string;
  name: string;
  shortName?: string;
  description?: string;
  category: ScaleDefinitionCategory;
  status: ScaleStatus;
  currentVersionId: string | null;
  sortOrder: number;
  tags: string[];
};

export type ScaleScoreRangeSummary = {
  min: number;
  max: number;
  step?: number;
};

export type ScaleGroupConfigSummary = {
  code: string;
  title: string;
  order: number;
  instruction?: string;
  description?: string;
  cognitiveDomainCodes: string[];
};

export type ScaleItemConfigSummary = {
  code: string;
  crfCode?: string;
  title: string;
  prompt?: string;
  instruction?: string;
  order: number;
  groupCode?: string;
  responseType: ScaleResponseType;
  scoreRange: ScaleScoreRangeSummary;
  countsTowardTotal: boolean;
  cognitiveDomainCodes: string[];
  evidenceTypes: ScaleEvidenceType[];
  requiresTimer: boolean;
  supportsPhotoUpload: boolean;
  supportsHandwriting: boolean;
  requiresOperatorNote: boolean;
  scoringRule: ScaleRuleConfig;
  qualityControlRule: ScaleRuleConfig;
  reportingRule: ScaleRuleConfig;
  researchExportField?: string;
};

export type ScaleVersionSummary = {
  id: string;
  scaleDefinitionId: string;
  scaleCode: string;
  version: string;
  displayVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
  status: ScaleStatus;
  totalScoreRange: ScaleScoreRangeSummary;
  groups: ScaleGroupConfigSummary[];
  items: ScaleItemConfigSummary[];
  qualityControlRules: ScaleRuleConfig;
  reportingRules: ScaleRuleConfig;
  researchExportMappings: ScaleRuleConfig;
  effectiveFrom: Date | null;
  retiredAt: Date | null;
};

@Injectable()
export class ScalesService {
  constructor(
    @InjectModel(ScaleDefinition.name)
    private readonly scaleDefinitionModel: Model<ScaleDefinitionDocument>,
    @InjectModel(ScaleVersion.name)
    private readonly scaleVersionModel: Model<ScaleVersionDocument>,
  ) {}

  normalizeScaleCode(code: string): string {
    return code.trim().toLowerCase();
  }

  async findDefinitionByCode(
    code: string,
  ): Promise<ScaleDefinitionSummary | null> {
    const normalizedCode = this.normalizeScaleCode(code);

    if (!normalizedCode) {
      return null;
    }

    const definition = await this.scaleDefinitionModel
      .findOne({ code: normalizedCode })
      .exec();

    if (!definition) {
      return null;
    }

    return this.mapDefinition(definition);
  }

  async findVersionByScaleCodeAndVersion(
    scaleCode: string,
    version: string,
  ): Promise<ScaleVersionSummary | null> {
    const normalizedCode = this.normalizeScaleCode(scaleCode);
    const normalizedVersion = version.trim();

    if (!normalizedCode || !normalizedVersion) {
      return null;
    }

    const scaleVersion = await this.scaleVersionModel
      .findOne({ scaleCode: normalizedCode, version: normalizedVersion })
      .exec();

    if (!scaleVersion) {
      return null;
    }

    return this.mapVersion(scaleVersion);
  }

  async listActiveDefinitions(): Promise<ScaleDefinitionSummary[]> {
    const definitions = await this.scaleDefinitionModel
      .find({ status: 'active' })
      .sort({ sortOrder: 1, code: 1 })
      .exec();

    return definitions.map((definition) => this.mapDefinition(definition));
  }

  private mapDefinition(
    definition: ScaleDefinitionDocument,
  ): ScaleDefinitionSummary {
    return {
      id: definition._id.toString(),
      code: definition.code,
      name: definition.name,
      shortName: definition.shortName,
      description: definition.description,
      category: definition.category,
      status: definition.status,
      currentVersionId: definition.currentVersionId?.toString() ?? null,
      sortOrder: definition.sortOrder,
      tags: [...(definition.tags ?? [])],
    };
  }

  private mapVersion(scaleVersion: ScaleVersionDocument): ScaleVersionSummary {
    return {
      id: scaleVersion._id.toString(),
      scaleDefinitionId: scaleVersion.scaleDefinitionId.toString(),
      scaleCode: scaleVersion.scaleCode,
      version: scaleVersion.version,
      displayVersion: scaleVersion.displayVersion,
      crfVersion: scaleVersion.crfVersion,
      scoringRuleVersion: scaleVersion.scoringRuleVersion,
      fieldEncodingVersion: scaleVersion.fieldEncodingVersion,
      sourceDocument: scaleVersion.sourceDocument,
      status: scaleVersion.status,
      totalScoreRange: this.mapScoreRange(scaleVersion.totalScoreRange),
      groups: (scaleVersion.groups ?? []).map((group) =>
        this.mapGroupConfig(group),
      ),
      items: (scaleVersion.items ?? []).map((item) => this.mapItemConfig(item)),
      qualityControlRules: scaleVersion.qualityControlRules ?? null,
      reportingRules: scaleVersion.reportingRules ?? null,
      researchExportMappings: scaleVersion.researchExportMappings ?? null,
      effectiveFrom: scaleVersion.effectiveFrom ?? null,
      retiredAt: scaleVersion.retiredAt ?? null,
    };
  }

  private mapScoreRange(
    scoreRange: ScaleScoreRangeConfig,
  ): ScaleScoreRangeSummary {
    return {
      min: scoreRange.min,
      max: scoreRange.max,
      step: scoreRange.step,
    };
  }

  private mapGroupConfig(group: ScaleGroupConfig): ScaleGroupConfigSummary {
    return {
      code: group.code,
      title: group.title,
      order: group.order,
      instruction: group.instruction,
      description: group.description,
      cognitiveDomainCodes: [...(group.cognitiveDomainCodes ?? [])],
    };
  }

  private mapItemConfig(item: ScaleItemConfig): ScaleItemConfigSummary {
    return {
      code: item.code,
      crfCode: item.crfCode,
      title: item.title,
      prompt: item.prompt,
      instruction: item.instruction,
      order: item.order,
      groupCode: item.groupCode,
      responseType: item.responseType,
      scoreRange: this.mapScoreRange(item.scoreRange),
      countsTowardTotal: item.countsTowardTotal,
      cognitiveDomainCodes: [...(item.cognitiveDomainCodes ?? [])],
      evidenceTypes: [...(item.evidenceTypes ?? [])],
      requiresTimer: item.requiresTimer,
      supportsPhotoUpload: item.supportsPhotoUpload,
      supportsHandwriting: item.supportsHandwriting,
      requiresOperatorNote: item.requiresOperatorNote,
      scoringRule: item.scoringRule ?? null,
      qualityControlRule: item.qualityControlRule ?? null,
      reportingRule: item.reportingRule ?? null,
      researchExportField: item.researchExportField,
    };
  }
}
