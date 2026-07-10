import { IsMongoId } from 'class-validator';

export class ItemResponseDraftParamDto {
  @IsMongoId()
  patientId!: string;

  @IsMongoId()
  visitId!: string;

  @IsMongoId()
  scaleInstanceId!: string;

  @IsMongoId()
  itemResponseId!: string;
}
