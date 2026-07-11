import { IsMongoId } from 'class-validator';

export class ScoreResultParamDto {
  @IsMongoId()
  patientId!: string;

  @IsMongoId()
  visitId!: string;

  @IsMongoId()
  scaleInstanceId!: string;

  @IsMongoId()
  scoreResultId!: string;
}
