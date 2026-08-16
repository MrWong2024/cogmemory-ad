import { Transform } from 'class-transformer';
import { Equals, IsString, MaxLength, MinLength } from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class VoidAssessmentVisitDto {
  @Equals(true)
  confirm!: true;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
