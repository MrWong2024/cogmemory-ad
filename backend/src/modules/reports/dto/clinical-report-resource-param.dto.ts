import { IsMongoId } from 'class-validator';
import { ClinicalReportVisitParamDto } from './clinical-report-visit-param.dto';

export class ClinicalReportResourceParamDto extends ClinicalReportVisitParamDto {
  @IsMongoId()
  reportId!: string;
}
