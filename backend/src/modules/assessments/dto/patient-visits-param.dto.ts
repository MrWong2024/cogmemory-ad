import { IsMongoId } from 'class-validator';

export class PatientVisitsParamDto {
  @IsMongoId()
  patientId!: string;
}
