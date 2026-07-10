import { IsMongoId } from 'class-validator';

export class PatientVisitParamDto {
  @IsMongoId()
  patientId!: string;

  @IsMongoId()
  visitId!: string;
}
