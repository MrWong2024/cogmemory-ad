import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PatientAdministrationSessionGuard } from '../../assessments/guards/patient-administration-session.guard';
import type { PatientAdministrationHttpRequest } from '../../assessments/types/patient-administration-response.types';
import { UploadPatientAdministrationEvidenceDto } from '../dto/upload-patient-administration-evidence.dto';
import { MAX_PRIMARY_MEDIA_FILE_BYTES } from '../lib/media-file-validation';
import { MediaUploadExceptionInterceptor } from '../lib/media-upload-exception.interceptor';
import { PatientAdministrationEvidenceService } from '../services/patient-administration-evidence.service';
import type { PatientAdministrationEvidenceResponse } from '../types/patient-administration-evidence-response.types';
import type { UploadedMemoryFile } from '../types/uploaded-memory-file.types';

@Controller('patient-administration')
@UseGuards(PatientAdministrationSessionGuard)
export class PatientAdministrationEvidenceController {
  constructor(
    private readonly patientAdministrationEvidenceService: PatientAdministrationEvidenceService,
  ) {}

  @Post('current/evidence')
  @UseInterceptors(
    MediaUploadExceptionInterceptor,
    FileInterceptor('file', {
      limits: {
        files: 1,
        fileSize: MAX_PRIMARY_MEDIA_FILE_BYTES,
        fields: 4,
        fieldNameSize: 120,
        fieldSize: 32 * 1024,
      },
    }),
  )
  uploadEvidence(
    @Body() input: UploadPatientAdministrationEvidenceDto,
    @UploadedFile() file: UploadedMemoryFile | undefined,
    @Req() request: PatientAdministrationHttpRequest,
  ): Promise<PatientAdministrationEvidenceResponse> {
    if (!request.patientAdministration) {
      throw new UnauthorizedException();
    }
    return this.patientAdministrationEvidenceService.uploadEvidence(
      request.patientAdministration,
      input,
      file,
    );
  }
}
