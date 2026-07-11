import { IsMongoId } from 'class-validator';

export class ClinicalReportVisitParamDto {
  @IsMongoId()
  patientId!: string;

  @IsMongoId()
  visitId!: string;
}
