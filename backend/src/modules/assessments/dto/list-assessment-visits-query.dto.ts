import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  ASSESSMENT_STATUSES,
  ASSESSMENT_VISIT_TYPES,
  type AssessmentStatus,
  type AssessmentVisitType,
} from '../schemas/assessment-visit.schema';

export class ListAssessmentVisitsQueryDto {
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
  @IsIn(ASSESSMENT_STATUSES)
  status?: AssessmentStatus;

  @IsOptional()
  @IsIn(ASSESSMENT_VISIT_TYPES)
  visitType?: AssessmentVisitType;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;
}
