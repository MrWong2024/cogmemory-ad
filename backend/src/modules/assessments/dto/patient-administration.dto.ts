import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ScaleInstanceExecutionParamDto } from './scale-instance-execution-param.dto';
import { PATIENT_ADMINISTRATION_IMPACT_FACTOR_CODES } from '../patient-administration.constants';
import type { PatientAdministrationImpactFactorCode } from '../patient-administration.constants';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePatientAdministrationSessionDto {}

export class EnterPatientAdministrationDto {
  @Transform(trimString)
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class PatientAdministrationRevisionDto {
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;
}

export class CompletePatientAdministrationStepDto extends PatientAdministrationRevisionDto {}

export class CompletePatientAdministrationStaffStepDto extends PatientAdministrationRevisionDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  staffObservation!: string;
}

export class TakeOverPatientAdministrationStepDto extends PatientAdministrationRevisionDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  staffObservation!: string;
}

export class PatientAdministrationAssetParamDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  assetKey!: string;
}

export class PatientAdministrationStaffAssetParamDto extends ScaleInstanceExecutionParamDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  assetKey!: string;
}

export class PatientAdministrationControlDto extends PatientAdministrationRevisionDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PatientAdministrationRequiredReasonDto extends PatientAdministrationRevisionDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ConfirmPatientAdministrationPreparationDto extends PatientAdministrationRevisionDto {
  @IsArray()
  @ArrayUnique()
  @IsEnum(PATIENT_ADMINISTRATION_IMPACT_FACTOR_CODES, { each: true })
  impactFactorCodes!: PatientAdministrationImpactFactorCode[];

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  impactFactorNote?: string;
}
