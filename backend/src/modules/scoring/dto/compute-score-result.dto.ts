import { IsBoolean, ValidateIf } from 'class-validator';

export class ComputeScoreResultDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  confirm?: boolean;
}
