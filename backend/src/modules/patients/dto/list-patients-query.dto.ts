import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PATIENT_SOURCE_TYPES,
  PATIENT_STATUSES,
  type PatientSourceType,
  type PatientStatus,
} from '../schemas/patient.schema';

function trimOptionalString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListPatientsQueryDto {
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
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsIn(PATIENT_STATUSES)
  status?: PatientStatus;

  @IsOptional()
  @IsIn(PATIENT_SOURCE_TYPES)
  sourceType?: PatientSourceType;
}
