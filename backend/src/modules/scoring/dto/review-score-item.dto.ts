import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ReviewScoreItemDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  scoreValue!: number;

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
