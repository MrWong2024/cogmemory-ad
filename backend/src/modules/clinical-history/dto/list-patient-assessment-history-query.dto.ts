import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  isISO8601,
} from 'class-validator';
import {
  ASSESSMENT_STATUSES,
  ASSESSMENT_VISIT_TYPES,
  type AssessmentStatus,
  type AssessmentVisitType,
} from '../../assessments/schemas/assessment-visit.schema';

export function toStrictIsoDate(value: unknown): unknown {
  if (typeof value !== 'string' || !isISO8601(value, { strict: true })) {
    return value;
  }
  return new Date(value);
}

export class ListPatientAssessmentHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStrictIsoDate(value))
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStrictIsoDate(value))
  @IsDate()
  dateTo?: Date;

  @IsOptional()
  @IsIn(ASSESSMENT_VISIT_TYPES)
  visitType?: AssessmentVisitType;

  @IsOptional()
  @IsIn(ASSESSMENT_STATUSES)
  status?: AssessmentStatus;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MinLength(1)
  scaleCode?: string;
}
