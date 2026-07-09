// backend/src/modules/scales/seeds/scale-seed.types.ts
import type {
  ScaleDefinitionCategory,
  ScaleStatus,
} from '../schemas/scale-definition.schema';
import type {
  ScaleEvidenceType,
  ScaleResponseType,
} from '../schemas/scale-version.schema';

export type ScaleSeedRuleConfig = Record<string, unknown> | null;

export type ScaleSeedScoreRange = {
  min: number;
  max: number;
  step?: number;
};

export type ScaleSeedDefinition = {
  code: string;
  name: string;
  shortName?: string;
  description?: string;
  category: ScaleDefinitionCategory;
  status: ScaleStatus;
  sortOrder: number;
  tags: string[];
};

export type ScaleSeedGroup = {
  code: string;
  title: string;
  order: number;
  instruction?: string;
  description?: string;
  cognitiveDomainCodes: string[];
};

export type ScaleSeedItem = {
  code: string;
  crfCode?: string;
  title: string;
  prompt?: string;
  instruction?: string;
  order: number;
  groupCode?: string;
  responseType: ScaleResponseType;
  scoreRange: ScaleSeedScoreRange;
  countsTowardTotal: boolean;
  cognitiveDomainCodes: string[];
  evidenceTypes: ScaleEvidenceType[];
  requiresTimer: boolean;
  supportsPhotoUpload: boolean;
  supportsHandwriting: boolean;
  requiresOperatorNote: boolean;
  scoringRule: ScaleSeedRuleConfig;
  qualityControlRule: ScaleSeedRuleConfig;
  reportingRule: ScaleSeedRuleConfig;
  researchExportField?: string;
};

export type ScaleSeedVersion = {
  scaleCode: string;
  version: string;
  displayVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
  status: ScaleStatus;
  totalScoreRange: ScaleSeedScoreRange;
  groups: ScaleSeedGroup[];
  items: ScaleSeedItem[];
  qualityControlRules: ScaleSeedRuleConfig;
  reportingRules: ScaleSeedRuleConfig;
  researchExportMappings: ScaleSeedRuleConfig;
};

export type ScaleSeedData = {
  definition: ScaleSeedDefinition;
  version: ScaleSeedVersion;
};

export type ScaleSeedValidationIssue = {
  level: 'error' | 'warning';
  code: string;
  message: string;
  scaleCode?: string;
  itemCode?: string;
};

export type ScaleSeedValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  issues: ScaleSeedValidationIssue[];
};
