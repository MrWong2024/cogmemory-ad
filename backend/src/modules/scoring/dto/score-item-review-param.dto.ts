import { IsMongoId } from 'class-validator';
import { ScoreResultParamDto } from './score-result-param.dto';

export class ScoreItemReviewParamDto extends ScoreResultParamDto {
  @IsMongoId()
  itemResponseId!: string;
}
