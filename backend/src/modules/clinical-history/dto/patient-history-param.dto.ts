import { IsMongoId } from 'class-validator';

export class PatientHistoryParamDto {
  @IsMongoId()
  patientId!: string;
}
