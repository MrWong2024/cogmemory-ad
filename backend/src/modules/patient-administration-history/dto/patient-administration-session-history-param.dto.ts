import { IsMongoId } from 'class-validator';
import { ScaleInstanceExecutionParamDto } from '../../assessments/dto/scale-instance-execution-param.dto';

export class PatientAdministrationSessionHistoryParamDto extends ScaleInstanceExecutionParamDto {
  @IsMongoId()
  sessionId!: string;
}
