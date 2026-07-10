import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import { PATIENT_WORKFLOW_ROLES } from '../../patients/patients.constants';
import { MediaEvidenceAccessQueryDto } from '../dto/media-evidence-access-query.dto';
import { MediaEvidenceItemParamDto } from '../dto/media-evidence-item-param.dto';
import { MediaEvidenceParamDto } from '../dto/media-evidence-param.dto';
import { UploadMediaEvidenceDto } from '../dto/upload-media-evidence.dto';
import { VoidMediaEvidenceDto } from '../dto/void-media-evidence.dto';
import { MAX_PRIMARY_MEDIA_FILE_BYTES } from '../lib/media-file-validation';
import { MediaUploadExceptionInterceptor } from '../lib/media-upload-exception.interceptor';
import { MediaEvidenceWorkflowService } from '../services/media-evidence-workflow.service';
import type {
  MediaEvidenceAccessUrlResponse,
  MediaEvidenceListResponse,
  UploadMediaEvidenceResponse,
  VoidMediaEvidenceResponse,
} from '../types/media-evidence-response.types';
import type { MediaEvidenceUploadedFiles } from '../types/uploaded-memory-file.types';

@Controller(
  'patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId/media-evidences',
)
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class MediaEvidenceController {
  constructor(
    private readonly mediaEvidenceWorkflowService: MediaEvidenceWorkflowService,
  ) {}

  @Get()
  listEvidence(
    @Param() params: MediaEvidenceItemParamDto,
  ): Promise<MediaEvidenceListResponse> {
    return this.mediaEvidenceWorkflowService.listEvidence(params);
  }

  @Post()
  @UseInterceptors(
    MediaUploadExceptionInterceptor,
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'trajectory', maxCount: 1 },
      ],
      {
        limits: {
          files: 2,
          fileSize: MAX_PRIMARY_MEDIA_FILE_BYTES,
          fields: 30,
          fieldNameSize: 120,
          fieldSize: 32 * 1024,
        },
      },
    ),
  )
  uploadEvidence(
    @Param() params: MediaEvidenceItemParamDto,
    @Body() input: UploadMediaEvidenceDto,
    @UploadedFiles() files: MediaEvidenceUploadedFiles | undefined,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
  ): Promise<UploadMediaEvidenceResponse> {
    return this.mediaEvidenceWorkflowService.uploadEvidence(
      params,
      input,
      files,
      currentUser,
    );
  }

  @Get(':mediaEvidenceId/access-url')
  createAccessUrl(
    @Param() params: MediaEvidenceParamDto,
    @Query() query: MediaEvidenceAccessQueryDto,
  ): Promise<MediaEvidenceAccessUrlResponse> {
    return this.mediaEvidenceWorkflowService.createAccessUrl(params, query);
  }

  @Post(':mediaEvidenceId/void')
  @HttpCode(HttpStatus.OK)
  voidEvidence(
    @Param() params: MediaEvidenceParamDto,
    @Body() input: VoidMediaEvidenceDto,
    @CurrentUser() currentUser: AuthenticatedUserContext | undefined,
  ): Promise<VoidMediaEvidenceResponse> {
    return this.mediaEvidenceWorkflowService.voidEvidence(
      params,
      input,
      currentUser,
    );
  }
}
