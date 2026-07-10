import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  SCALE_ADMINISTRATION_MODES,
  type ScaleAdministrationMode,
} from '../schemas/scale-instance.schema';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeScaleCode(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class InitializeScaleInstanceDto {
  @Transform(({ value }) => normalizeScaleCode(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  scaleCode!: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  scaleVersion?: string;

  @IsOptional()
  @IsIn(SCALE_ADMINISTRATION_MODES)
  administrationMode: ScaleAdministrationMode = 'clinician_administered';
}
