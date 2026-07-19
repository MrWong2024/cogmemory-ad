import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { toStrictIsoDate } from './list-patient-assessment-history-query.dto';

export class GetPatientFollowUpTrendQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MinLength(1)
  scaleCode!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStrictIsoDate(value))
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStrictIsoDate(value))
  @IsDate()
  dateTo?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(100)
  maxPoints = 50;
}
