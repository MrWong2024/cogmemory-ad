import { IsIn, IsOptional } from 'class-validator';

export const MEDIA_EVIDENCE_ACCESS_ASSETS = ['primary', 'trajectory'] as const;
export type MediaEvidenceAccessAsset =
  (typeof MEDIA_EVIDENCE_ACCESS_ASSETS)[number];

export class MediaEvidenceAccessQueryDto {
  @IsOptional()
  @IsIn(MEDIA_EVIDENCE_ACCESS_ASSETS)
  asset: MediaEvidenceAccessAsset = 'primary';
}
