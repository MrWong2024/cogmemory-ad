import { IsBoolean, ValidateIf } from 'class-validator';

export class ComputeCognitiveDomainResultDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  confirm?: boolean;
}
