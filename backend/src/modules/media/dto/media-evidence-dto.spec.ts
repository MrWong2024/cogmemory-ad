import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MediaEvidenceAccessQueryDto } from './media-evidence-access-query.dto';
import { MediaEvidenceItemParamDto } from './media-evidence-item-param.dto';
import { MediaEvidenceParamDto } from './media-evidence-param.dto';
import { UploadMediaEvidenceDto } from './upload-media-evidence.dto';
import { VoidMediaEvidenceDto } from './void-media-evidence.dto';

describe('media evidence DTO validation', () => {
  const ids = {
    patientId: '507f1f77bcf86cd799439011',
    visitId: '507f1f77bcf86cd799439012',
    scaleInstanceId: '507f1f77bcf86cd799439013',
    itemResponseId: '507f1f77bcf86cd799439014',
    mediaEvidenceId: '507f1f77bcf86cd799439015',
  };

  it('validates every ownership and evidence path ID', async () => {
    expect(
      await validate(plainToInstance(MediaEvidenceItemParamDto, ids)),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(MediaEvidenceParamDto, ids)),
    ).toHaveLength(0);

    const invalid = plainToInstance(MediaEvidenceParamDto, {
      patientId: 'bad',
      visitId: 'bad',
      scaleInstanceId: 'bad',
      itemResponseId: 'bad',
      mediaEvidenceId: 'bad',
    });
    expect((await validate(invalid)).map((error) => error.property)).toEqual(
      expect.arrayContaining(Object.keys(ids)),
    );
  });

  it('safely transforms multipart numbers, booleans and empty strings', async () => {
    const dto = plainToInstance(UploadMediaEvidenceDto, {
      evidenceType: 'handwriting',
      captureMode: 'tablet_handwriting',
      imageWidth: '1024',
      imageHeight: '768',
      pageNo: '1',
      isColor: 'false',
      strokeCount: '12',
      trajectoryDurationMs: '90000',
      canvasWidth: '1024.5',
      canvasHeight: '768',
      sourceDevice: ' tablet ',
      sourceApp: '',
      trajectoryFormat: 'strokes',
      inputTool: 'stylus',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        imageWidth: 1024,
        imageHeight: 768,
        pageNo: 1,
        isColor: false,
        strokeCount: 12,
        trajectoryDurationMs: 90000,
        canvasWidth: 1024.5,
        canvasHeight: 768,
        sourceDevice: 'tablet',
        sourceApp: undefined,
      }),
    );
  });

  it('rejects invalid multipart conversions and enum values', async () => {
    const dto = plainToInstance(UploadMediaEvidenceDto, {
      evidenceType: 'audio',
      captureMode: 'imported',
      imageWidth: '1.5',
      isColor: 'yes',
      trajectoryFormat: 'svg',
      inputTool: 'pen',
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'evidenceType',
        'captureMode',
        'imageWidth',
        'isColor',
        'trajectoryFormat',
        'inputTool',
      ]),
    );
  });

  it('defaults access asset and validates a trimmed void reason', async () => {
    const query = plainToInstance(MediaEvidenceAccessQueryDto, {});
    const reason = plainToInstance(VoidMediaEvidenceDto, {
      reason: ' wrong capture ',
    });

    expect(await validate(query)).toHaveLength(0);
    expect(query.asset).toBe('primary');
    expect(
      await validate(
        plainToInstance(MediaEvidenceAccessQueryDto, { asset: 'permanent' }),
      ),
    ).not.toHaveLength(0);
    expect(await validate(reason)).toHaveLength(0);
    expect(reason.reason).toBe('wrong capture');
    expect(
      await validate(plainToInstance(VoidMediaEvidenceDto, { reason: 'x' })),
    ).not.toHaveLength(0);
  });

  it('rejects all server-controlled upload and void fields', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    for (const field of [
      'patientId',
      'assessmentVisitId',
      'scaleInstanceId',
      'itemResponseId',
      'subjectCode',
      'scaleDefinitionId',
      'scaleVersionId',
      'scaleCode',
      'scaleVersion',
      'instanceCode',
      'itemCode',
      'evidenceCode',
      'status',
      'storageStatus',
      'objectKey',
      'bucket',
      'publicUrl',
      'checksum',
      'operatorSnapshot',
      'qualityStatus',
      'qualityHints',
      'itemSnapshot',
      'versionTrace',
      'metadata',
      'lockedAt',
      'voidedAt',
      'deletedAt',
    ]) {
      await expect(
        pipe.transform(
          {
            evidenceType: 'photo',
            captureMode: 'photo_upload',
            [field]: 'forged',
          },
          { type: 'body', metatype: UploadMediaEvidenceDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    await expect(
      pipe.transform(
        { reason: 'valid reason', metadata: { forged: true } },
        { type: 'body', metatype: VoidMediaEvidenceDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
