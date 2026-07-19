import { IsMongoId } from 'class-validator';

export class ClinicalReportHistoryParamDto {
  @IsMongoId()
  patientId!: string;

  @IsMongoId()
  visitId!: string;

  @IsMongoId()
  reportId!: string;
}
