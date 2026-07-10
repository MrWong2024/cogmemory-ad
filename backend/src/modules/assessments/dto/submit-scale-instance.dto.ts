import { IsBoolean, ValidateIf } from 'class-validator';

export class SubmitScaleInstanceDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  confirm?: boolean;
}
