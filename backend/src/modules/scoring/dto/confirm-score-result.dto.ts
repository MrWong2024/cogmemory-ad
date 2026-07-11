import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ConfirmScoreResultDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  confirm?: boolean;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(2000)
  reviewNote!: string;

  @IsString()
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;
}
