import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import {
  PATIENT_ADMINISTRATION_EVIDENCE_TYPES,
  type PatientAdministrationEvidenceType,
} from '../../assessments/patient-administration.constants';

function emptyStringToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

function toNumber(value: unknown): unknown {
  const normalized = emptyStringToUndefined(value);
  if (typeof normalized !== 'string') {
    return normalized;
  }
  const result = Number(normalized);
  return Number.isFinite(result) ? result : normalized;
}

export class UploadPatientAdministrationEvidenceDto {
  @Transform(({ value }) => toNumber(value))
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;

  @IsIn(PATIENT_ADMINISTRATION_EVIDENCE_TYPES)
  evidenceType!: PatientAdministrationEvidenceType;

  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(value))
  @IsISO8601({ strict: true })
  capturedAt?: string;

  @IsOptional()
  @Transform(({ value }) => toNumber(value))
  @IsInt()
  @Min(1)
  @Max(600000)
  durationMs?: number;
}
