import { Transform, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsMongoId,
  ValidateIf,
} from 'class-validator';

function normalizeScopeIds({ value }: TransformFnParams): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((item: unknown) =>
    typeof item === 'string' ? item.trim().toLowerCase() : item,
  );
}

export class GenerateClinicalReportDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  confirm?: boolean;

  @Transform(normalizeScopeIds)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsMongoId({ each: true })
  primaryScaleInstanceIds!: string[];
}
