import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import type { MediaEvidenceParamDto } from '../dto/media-evidence-param.dto';
import type { MediaEvidenceSummary } from './media-evidence.service';
import { MediaEvidenceTranscriptionService } from './media-evidence-transcription.service';
import { PatientAudioAsrError } from './patient-audio-asr-client.service';

const ids = {
  patientId: '64b000000000000000000001',
  visitId: '64b000000000000000000002',
  scaleInstanceId: '64b000000000000000000003',
  itemResponseId: '64b000000000000000000004',
  mediaEvidenceId: '64b000000000000000000005',
  sessionId: '64b000000000000000000006',
  userId: '64b000000000000000000007',
};

const params: MediaEvidenceParamDto = {
  patientId: ids.patientId,
  visitId: ids.visitId,
  scaleInstanceId: ids.scaleInstanceId,
  itemResponseId: ids.itemResponseId,
  mediaEvidenceId: ids.mediaEvidenceId,
};
const user: AuthenticatedUserContext = {
  id: ids.userId,
  accountName: 'doctor',
  displayName: 'Doctor',
  roles: ['doctor'],
  permissions: [],
};

function evidence(overrides: Partial<MediaEvidenceSummary> = {}) {
  return {
    id: ids.mediaEvidenceId,
    patientId: ids.patientId,
    assessmentVisitId: ids.visitId,
    scaleInstanceId: ids.scaleInstanceId,
    itemResponseId: ids.itemResponseId,
    evidenceType: 'audio',
    captureMode: 'browser_audio_recording',
    status: 'attached',
    storageStatus: 'stored',
    storage: {
      storageDriver: 'fake',
      objectKey: 'private/audio.webm',
      fileExtension: 'webm',
      sizeBytes: 100,
      storedAt: new Date(),
    },
    patientAdministrationContext: {
      sessionId: ids.sessionId,
      stepKey: 's1',
      stepRun: 1,
    },
    audioMetadata: { durationMs: 1000 },
    transcription: {
      status: 'not_requested',
      requestedAt: null,
      completedAt: null,
      requestedBy: null,
    },
    lockedAt: null,
    voidedAt: null,
    deletedAt: null,
    ...overrides,
  } as MediaEvidenceSummary;
}

function createSubject(provider: 'disabled' | 'stub' | 'bailian' = 'stub') {
  const requestedBy = {
    operatorId: ids.userId,
    operatorName: 'Doctor',
    operatorRole: 'doctor' as const,
  };
  const asr = {
    getMode: jest.fn(() => ({
      provider,
      model: 'qwen-audio-3.0-asr-flash',
      timeoutMs: 90000,
    })),
    transcribe: jest.fn().mockResolvedValue({
      provider: provider === 'bailian' ? 'bailian' : 'stub',
      model: 'qwen-audio-3.0-asr-flash',
      text: '测试转写候选',
    }),
  };
  const patients = {
    findPatientById: jest.fn().mockResolvedValue({ status: 'active' }),
  };
  const assessments = {
    findVisitByPatientAndId: jest
      .fn()
      .mockResolvedValue({ status: 'in_progress' }),
    findScaleInstanceByPatientVisitAndId: jest.fn().mockResolvedValue({
      status: 'in_progress',
      lockedAt: null,
      voidedAt: null,
      submissionWriteBarrier: null,
    }),
    findItemResponseByOwnership: jest.fn().mockResolvedValue({
      status: 'in_progress',
      lockedAt: null,
      voidedAt: null,
      submissionWriteBarrier: null,
    }),
  };
  const media = {
    findEvidenceForTranscription: jest.fn().mockResolvedValue(evidence()),
    claimTranscription: jest
      .fn()
      .mockImplementation(
        (
          _ownership: unknown,
          _id: string,
          _actor: unknown,
          claimProvider: 'stub' | 'bailian',
          model: string,
          claimedAt: Date,
        ) => ({
          claimedAt,
          transcription: {
            status: 'processing',
            provider: claimProvider,
            model,
            requestedAt: claimedAt,
            completedAt: null,
            requestedBy,
          },
        }),
      ),
    completeTranscription: jest.fn().mockResolvedValue({
      status: 'succeeded',
      provider: provider === 'bailian' ? 'bailian' : 'stub',
      model: 'qwen-audio-3.0-asr-flash',
      text: '测试转写候选',
      requestedAt: new Date(),
      completedAt: new Date(),
      requestedBy,
    }),
    failTranscription: jest.fn().mockResolvedValue({
      status: 'failed',
      provider: provider === 'bailian' ? 'bailian' : 'stub',
      model: 'qwen-audio-3.0-asr-flash',
      errorCode: 'provider_unavailable',
      requestedAt: new Date(),
      completedAt: new Date(),
      requestedBy,
    }),
  };
  const sessions = {
    buildOperatorSnapshot: jest.fn(() => ({
      operatorId: ids.userId,
      operatorName: 'Doctor',
      operatorRole: 'doctor',
    })),
  };
  const storage = {
    getSignedUrl: jest.fn().mockResolvedValue({
      url: 'https://signed.example/audio',
      expiresAt: new Date(),
    }),
  };
  const service = new MediaEvidenceTranscriptionService(
    asr as never,
    patients as never,
    assessments as never,
    media as never,
    sessions as never,
    storage as never,
  );
  return { service, asr, patients, assessments, media, storage };
}

describe('MediaEvidenceTranscriptionService', () => {
  it('checks disabled provider before ownership and leaves evidence untouched', async () => {
    const subject = createSubject('disabled');
    await expect(
      subject.service.transcribe(params, user),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(subject.patients.findPatientById).not.toHaveBeenCalled();
    expect(subject.media.claimTranscription).not.toHaveBeenCalled();
  });

  it('claims and completes stub transcription without generating a signed URL', async () => {
    const subject = createSubject('stub');
    await expect(
      subject.service.transcribe(params, user),
    ).resolves.toMatchObject({
      mediaEvidenceId: ids.mediaEvidenceId,
      transcription: { status: 'succeeded', text: '测试转写候选' },
    });
    expect(subject.media.claimTranscription).toHaveBeenCalledTimes(1);
    expect(subject.storage.getSignedUrl).not.toHaveBeenCalled();
    expect(subject.asr.transcribe).toHaveBeenCalledWith({
      format: 'webm',
      signedUrl: undefined,
    });
  });

  it('uses the existing ten-minute signed URL only for Bailian', async () => {
    const subject = createSubject('bailian');
    await subject.service.transcribe(params, user);
    expect(subject.storage.getSignedUrl).toHaveBeenCalledWith(
      'private/audio.webm',
      { expiresInSeconds: 600 },
    );
    expect(subject.asr.transcribe).toHaveBeenCalledWith({
      format: 'webm',
      signedUrl: 'https://signed.example/audio',
    });
  });

  it('rejects known audio over five minutes before claim', async () => {
    const subject = createSubject();
    subject.media.findEvidenceForTranscription.mockResolvedValue(
      evidence({ audioMetadata: { durationMs: 300001 } }),
    );
    await expect(
      subject.service.transcribe(params, user),
    ).rejects.toMatchObject({
      response: { code: 'MEDIA_TRANSCRIPTION_NOT_ALLOWED' },
    });
    expect(subject.media.claimTranscription).not.toHaveBeenCalled();
  });

  it('allows unknown duration and returns succeeded idempotently without provider use', async () => {
    const subject = createSubject();
    subject.media.findEvidenceForTranscription.mockResolvedValue(
      evidence({
        audioMetadata: { durationMs: null },
        transcription: {
          status: 'succeeded',
          text: 'existing',
          provider: 'stub',
          model: 'qwen-audio-3.0-asr-flash',
          requestedAt: new Date(),
          completedAt: new Date(),
          requestedBy: null,
        },
      }),
    );
    await expect(
      subject.service.transcribe(params, user),
    ).resolves.toMatchObject({
      transcription: { status: 'succeeded', text: 'existing' },
    });
    expect(subject.media.claimTranscription).not.toHaveBeenCalled();
    expect(subject.asr.transcribe).not.toHaveBeenCalled();
  });

  it('returns conflicts for an active claim or a stale completion miss', async () => {
    const active = createSubject();
    active.media.claimTranscription.mockResolvedValue(null);
    await expect(active.service.transcribe(params, user)).rejects.toMatchObject(
      {
        response: { code: 'MEDIA_TRANSCRIPTION_CONFLICT' },
      },
    );

    const stale = createSubject();
    stale.media.completeTranscription.mockResolvedValue(null);
    await expect(stale.service.transcribe(params, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('persists a finite failed state and keeps technical failures on HTTP-success path', async () => {
    const subject = createSubject();
    subject.asr.transcribe.mockRejectedValue(
      new PatientAudioAsrError('provider_rejected'),
    );
    subject.media.failTranscription.mockResolvedValue({
      status: 'failed',
      provider: 'stub',
      model: 'qwen-audio-3.0-asr-flash',
      errorCode: 'provider_rejected',
      requestedAt: new Date(),
      completedAt: new Date(),
      requestedBy: null,
    });
    await expect(
      subject.service.transcribe(params, user),
    ).resolves.toMatchObject({
      transcription: { status: 'failed', errorCode: 'provider_rejected' },
    });
    expect(subject.media.failTranscription).toHaveBeenCalledTimes(1);
  });

  it.each([
    { evidenceType: 'photo', captureMode: 'photo_upload' },
    { status: 'voided', voidedAt: new Date() },
    { status: 'locked', lockedAt: new Date() },
    { storageStatus: 'deleted', deletedAt: new Date() },
  ] as Partial<MediaEvidenceSummary>[])(
    'rejects ineligible evidence without claim %#',
    async (override) => {
      const subject = createSubject();
      subject.media.findEvidenceForTranscription.mockResolvedValue(
        evidence(override),
      );
      await expect(
        subject.service.transcribe(params, user),
      ).rejects.toMatchObject({
        response: { code: 'MEDIA_TRANSCRIPTION_NOT_ALLOWED' },
      });
      expect(subject.media.claimTranscription).not.toHaveBeenCalled();
    },
  );
});
