import { IsMongoId } from 'class-validator';

export class MediaEvidenceItemParamDto {
  @IsMongoId()
  patientId!: string;

  @IsMongoId()
  visitId!: string;

  @IsMongoId()
  scaleInstanceId!: string;

  @IsMongoId()
  itemResponseId!: string;
}
