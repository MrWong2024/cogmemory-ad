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

export class LockClinicalReportDto {
  @Allow()
  confirm?: boolean;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  lockNote!: string;

  @IsString()
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}
