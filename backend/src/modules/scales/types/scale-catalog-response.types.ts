import type { ScaleDefinitionCategory } from '../schemas/scale-definition.schema';

export type ScaleScoreRangeResponse = {
  min: number;
  max: number;
  step?: number;
};

export type ScaleCapabilityResponse = {
  supportsPhotoUpload: boolean;
  supportsHandwriting: boolean;
  requiresTimer: boolean;
  supportsRawText: boolean;
  supportsOperatorNote: boolean;
};

export type AvailableScaleOptionResponse = {
  code: string;
  name: string;
  shortName?: string;
  description?: string;
  category: ScaleDefinitionCategory;
  version: string;
  displayVersion?: string;
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
  totalScoreRange: ScaleScoreRangeResponse;
  groupCount: number;
  itemCount: number;
  capabilities: ScaleCapabilityResponse;
};

export type AvailableScaleListResponse = {
  items: AvailableScaleOptionResponse[];
};

export type MaterializedScaleVersionReference = {
  scaleDefinitionId: string;
  scaleVersionId: string;
  scaleCode: string;
  version: string;
  option: AvailableScaleOptionResponse;
};
