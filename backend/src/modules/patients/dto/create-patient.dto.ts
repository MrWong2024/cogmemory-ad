import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PATIENT_HANDEDNESSES,
  PATIENT_SEXES,
  PATIENT_SOURCE_TYPES,
  type PatientHandedness,
  type PatientSex,
  type PatientSourceType,
} from '../schemas/patient.schema';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimTags(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value
    .map((item: unknown) => (typeof item === 'string' ? item.trim() : item))
    .filter((item: unknown) => item !== '');
}

export class CreatePatientDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  subjectCode!: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsIn(PATIENT_SOURCE_TYPES)
  sourceType?: PatientSourceType;

  @IsOptional()
  @IsIn(PATIENT_SEXES)
  sex?: PatientSex;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(40)
  educationYears?: number;

  @IsOptional()
  @IsIn(PATIENT_HANDEDNESSES)
  handedness?: PatientHandedness;

  @IsOptional()
  @Transform(({ value }) => trimTags(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
