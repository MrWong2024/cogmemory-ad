import { IsMongoId } from 'class-validator';

export class PatientIdParamDto {
  @IsMongoId()
  patientId!: string;
}
