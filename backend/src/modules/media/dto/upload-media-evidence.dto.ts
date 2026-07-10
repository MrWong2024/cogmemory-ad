import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  HandwritingInputTool,
  HandwritingTrajectoryFormat,
  MediaCaptureMode,
  MediaEvidenceType,
} from '../schemas/media-evidence.schema';

export const UPLOAD_MEDIA_EVIDENCE_TYPES = ['photo', 'handwriting'] as const;
export const UPLOAD_MEDIA_CAPTURE_MODES = [
  'photo_upload',
  'paper_scan',
  'tablet_handwriting',
] as const;
export const UPLOAD_TRAJECTORY_FORMATS = ['json', 'strokes'] as const;
export const UPLOAD_HANDWRITING_INPUT_TOOLS = [
  'stylus',
  'finger',
  'mouse',
  'unknown',
] as const;

function emptyStringToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

function trimOptionalString(value: unknown): unknown {
  const normalizedValue = emptyStringToUndefined(value);
  return typeof normalizedValue === 'string'
    ? normalizedValue.trim()
    : normalizedValue;
}

function toOptionalNumber(value: unknown): unknown {
  const normalizedValue = emptyStringToUndefined(value);

  if (typeof normalizedValue !== 'string') {
    return normalizedValue;
  }

  const numberValue = Number(normalizedValue);
  return Number.isFinite(numberValue) ? numberValue : normalizedValue;
}

function toOptionalBoolean(value: unknown): unknown {
  const normalizedValue = emptyStringToUndefined(value);

  if (normalizedValue === 'true') {
    return true;
  }

  if (normalizedValue === 'false') {
    return false;
  }

  return normalizedValue;
}

export class UploadMediaEvidenceDto {
  @IsIn(UPLOAD_MEDIA_EVIDENCE_TYPES)
  evidenceType!: Extract<MediaEvidenceType, 'photo' | 'handwriting'>;

  @IsIn(UPLOAD_MEDIA_CAPTURE_MODES)
  captureMode!: Extract<
    MediaCaptureMode,
    'photo_upload' | 'paper_scan' | 'tablet_handwriting'
  >;

  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(value))
  @IsISO8601({ strict: true })
  capturedAt?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(120)
  sourceDevice?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(120)
  sourceApp?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(1000)
  captureNote?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(4000)
  operatorNote?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(1)
  @Max(20000)
  imageWidth?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(1)
  @Max(20000)
  imageHeight?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(50)
  orientation?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(1)
  @Max(1000)
  pageNo?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isColor?: boolean;

  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(value))
  @IsIn(UPLOAD_TRAJECTORY_FORMATS)
  trajectoryFormat?: Extract<HandwritingTrajectoryFormat, 'json' | 'strokes'>;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(0)
  @Max(100000)
  strokeCount?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(0)
  @Max(86400000)
  trajectoryDurationMs?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  @Max(20000)
  canvasWidth?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  @Max(20000)
  canvasHeight?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(120)
  deviceType?: string;

  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(value))
  @IsIn(UPLOAD_HANDWRITING_INPUT_TOOLS)
  inputTool?: HandwritingInputTool;
}
