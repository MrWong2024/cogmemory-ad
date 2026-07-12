import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateClinicalReportDraftDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  doctorOpinion!: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @ValidateIf((_object, value: unknown) => value !== '')
  @MinLength(3)
  @MaxLength(4000)
  recommendationText?: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  editNote!: string;

  @IsString()
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}
