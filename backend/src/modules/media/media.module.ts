// backend/src/modules/media/media.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MediaEvidence,
  MediaEvidenceSchema,
} from './schemas/media-evidence.schema';
import { MediaEvidenceService } from './services/media-evidence.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MediaEvidence.name, schema: MediaEvidenceSchema },
    ]),
  ],
  providers: [MediaEvidenceService],
  exports: [MediaEvidenceService],
})
export class MediaModule {}
