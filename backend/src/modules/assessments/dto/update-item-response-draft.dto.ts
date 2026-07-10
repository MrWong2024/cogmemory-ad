import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ITEM_TIMER_SOURCES,
  PROMPT_RESPONSE_TYPES,
  type ItemTimerSource,
  type PromptResponseType,
} from '../schemas/item-response.schema';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeCode(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class UpdateItemStepDraftDto {
  @Transform(({ value }) => normalizeCode(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  stepCode!: string;

  @IsOptional()
  actualValue?: unknown;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class UpdatePromptResponseDraftDto {
  @IsIn(PROMPT_RESPONSE_TYPES)
  promptType!: PromptResponseType;

  @IsInt()
  @Min(1)
  order!: number;

  @IsOptional()
  responseAfterPrompt?: unknown;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class UpdateItemTimingDraftDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  startedAt?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  completedAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number | null;

  @IsOptional()
  @IsIn(ITEM_TIMER_SOURCES)
  timerSource?: ItemTimerSource;
}

export class UpdateItemResponseDraftDto {
  @IsOptional()
  rawResponse?: unknown;

  @IsOptional()
  structuredResponse?: Record<string, unknown> | null;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(10000)
  responseText?: string | null;

  @IsOptional()
  @IsBoolean()
  isMissing?: boolean;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(1000)
  missingReason?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UpdateItemStepDraftDto)
  stepResponses?: UpdateItemStepDraftDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UpdatePromptResponseDraftDto)
  promptResponses?: UpdatePromptResponseDraftDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateItemTimingDraftDto)
  timing?: UpdateItemTimingDraftDto | null;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(4000)
  operatorNote?: string | null;

  @IsOptional()
  @IsBoolean()
  markAsAnswered?: boolean;
}
