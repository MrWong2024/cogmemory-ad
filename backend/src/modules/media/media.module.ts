// backend/src/modules/media/media.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AssessmentsModule } from '../assessments/assessments.module';
import { AuthModule } from '../auth/auth.module';
import { PatientsModule } from '../patients/patients.module';
import { StorageModule } from '../storage/storage.module';
import { MediaEvidenceController } from './controllers/media-evidence.controller';
import { MediaUploadExceptionInterceptor } from './lib/media-upload-exception.interceptor';
import {
  MediaEvidence,
  MediaEvidenceSchema,
} from './schemas/media-evidence.schema';
import { MediaEvidenceService } from './services/media-evidence.service';
import { MediaEvidenceWorkflowService } from './services/media-evidence-workflow.service';

@Module({
  imports: [
    AuthModule,
    PatientsModule,
    AssessmentsModule,
    StorageModule,
    MongooseModule.forFeature([
      { name: MediaEvidence.name, schema: MediaEvidenceSchema },
    ]),
  ],
  controllers: [MediaEvidenceController],
  providers: [
    MediaEvidenceService,
    MediaEvidenceWorkflowService,
    MediaUploadExceptionInterceptor,
  ],
  exports: [MediaEvidenceService],
})
export class MediaModule {}
