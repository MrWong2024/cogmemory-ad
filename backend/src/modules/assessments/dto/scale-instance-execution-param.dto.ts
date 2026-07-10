import { IsMongoId } from 'class-validator';

export class ScaleInstanceExecutionParamDto {
  @IsMongoId()
  patientId!: string;

  @IsMongoId()
  visitId!: string;

  @IsMongoId()
  scaleInstanceId!: string;
}
