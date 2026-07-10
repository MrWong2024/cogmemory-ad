import { IsMongoId } from 'class-validator';
import { MediaEvidenceItemParamDto } from './media-evidence-item-param.dto';

export class MediaEvidenceParamDto extends MediaEvidenceItemParamDto {
  @IsMongoId()
  mediaEvidenceId!: string;
}
