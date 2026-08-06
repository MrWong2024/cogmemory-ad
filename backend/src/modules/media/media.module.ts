// backend/src/modules/media/media.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AssessmentsModule } from '../assessments/assessments.module';
import { AuthModule } from '../auth/auth.module';
import { PatientsModule } from '../patients/patients.module';
import { StorageModule } from '../storage/storage.module';
import { ScalesModule } from '../scales/scales.module';
import { MediaEvidenceController } from './controllers/media-evidence.controller';
import { PatientAdministrationEvidenceController } from './controllers/patient-administration-evidence.controller';
import { PatientAdministrationReviewController } from './controllers/patient-administration-review.controller';
import { MediaUploadExceptionInterceptor } from './lib/media-upload-exception.interceptor';
import {
  MediaEvidence,
  MediaEvidenceSchema,
} from './schemas/media-evidence.schema';
import { MediaEvidenceService } from './services/media-evidence.service';
import { MediaEvidenceWorkflowService } from './services/media-evidence-workflow.service';
import { PatientAdministrationEvidenceService } from './services/patient-administration-evidence.service';
import { PatientAudioAsrClientService } from './services/patient-audio-asr-client.service';
import { MediaEvidenceTranscriptionService } from './services/media-evidence-transcription.service';
import { PatientAdministrationReviewService } from './services/patient-administration-review.service';

@Module({
  imports: [
    AuthModule,
    PatientsModule,
    AssessmentsModule,
    StorageModule,
    ScalesModule,
    MongooseModule.forFeature([
      { name: MediaEvidence.name, schema: MediaEvidenceSchema },
    ]),
  ],
  controllers: [
    MediaEvidenceController,
    PatientAdministrationEvidenceController,
    PatientAdministrationReviewController,
  ],
  providers: [
    MediaEvidenceService,
    MediaEvidenceWorkflowService,
    PatientAdministrationEvidenceService,
    PatientAudioAsrClientService,
    MediaEvidenceTranscriptionService,
    PatientAdministrationReviewService,
    MediaUploadExceptionInterceptor,
  ],
  exports: [MediaEvidenceService],
})
export class MediaModule {}
