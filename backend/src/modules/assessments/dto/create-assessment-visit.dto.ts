import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ASSESSMENT_VISIT_TYPES,
  type AssessmentVisitType,
} from '../schemas/assessment-visit.schema';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAssessmentVisitDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  visitCode!: string;

  @IsOptional()
  @IsIn(ASSESSMENT_VISIT_TYPES)
  visitType?: AssessmentVisitType;

  @Type(() => Date)
  @IsDate()
  assessmentDate!: Date;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
