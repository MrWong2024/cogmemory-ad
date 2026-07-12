import { Transform } from 'class-transformer';
import {
  Allow,
  IsISO8601,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateClinicalReportCorrectionDto {
  @Allow()
  confirm?: boolean;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  correctionReason!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  changeSummary!: string;

  @IsString()
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}
