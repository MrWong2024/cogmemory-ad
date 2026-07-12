import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ClinicalReportResourceParamDto } from './clinical-report-resource-param.dto';
import { ConfirmClinicalReportDto } from './confirm-clinical-report.dto';
import { SubmitClinicalReportForConfirmationDto } from './submit-clinical-report-for-confirmation.dto';
import { UpdateClinicalReportDraftDto } from './update-clinical-report-draft.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const patientId = '507f1f77bcf86cd799439011';
const visitId = '507f1f77bcf86cd799439012';
const reportId = '507f1f77bcf86cd799439013';
const expectedUpdatedAt = '2026-07-12T08:00:00.000Z';

async function transformBody<T extends object>(
  value: object,
  metatype: new () => T,
): Promise<T> {
  return (await pipe.transform(value, { type: 'body', metatype })) as T;
}

describe('Clinical report review DTOs', () => {
  it('validates all resource path MongoIds', async () => {
    await expect(
      pipe.transform(
        { patientId, visitId, reportId },
        { type: 'param', metatype: ClinicalReportResourceParamDto },
      ),
    ).resolves.toEqual({ patientId, visitId, reportId });
    await expect(
      pipe.transform(
        { patientId, visitId, reportId: 'invalid' },
        { type: 'param', metatype: ClinicalReportResourceParamDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('trims controlled draft text and allows recommendation clearing', async () => {
    await expect(
      transformBody(
        {
          doctorOpinion: '  脱敏测试意见  ',
          recommendationText: '   ',
          editNote: '  脱敏修改依据  ',
          expectedUpdatedAt,
        },
        UpdateClinicalReportDraftDto,
      ),
    ).resolves.toEqual({
      doctorOpinion: '脱敏测试意见',
      recommendationText: '',
      editNote: '脱敏修改依据',
      expectedUpdatedAt,
    });
  });

  it.each([
    { doctorOpinion: 'ab', editNote: 'valid note', expectedUpdatedAt },
    {
      doctorOpinion: 'valid opinion',
      recommendationText: 'ab',
      editNote: 'valid note',
      expectedUpdatedAt,
    },
    { doctorOpinion: 'valid opinion', editNote: 'ab', expectedUpdatedAt },
    {
      doctorOpinion: 'valid opinion',
      editNote: 'valid note',
      expectedUpdatedAt: '2026-02-30T00:00:00.000Z',
    },
    {
      doctorOpinion: 'x'.repeat(4001),
      editNote: 'valid note',
      expectedUpdatedAt,
    },
    {
      doctorOpinion: 'valid opinion',
      recommendationText: 'x'.repeat(4001),
      editNote: 'valid note',
      expectedUpdatedAt,
    },
  ])('rejects invalid draft input %#', async (input) => {
    await expect(
      transformBody(input, UpdateClinicalReportDraftDto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates submission and confirmation bodies', async () => {
    await expect(
      transformBody(
        {
          confirm: true,
          submissionNote: '  脱敏提交说明  ',
          expectedUpdatedAt,
        },
        SubmitClinicalReportForConfirmationDto,
      ),
    ).resolves.toEqual({
      confirm: true,
      submissionNote: '脱敏提交说明',
      expectedUpdatedAt,
    });
    await expect(
      transformBody(
        {
          confirm: true,
          confirmationNote: '  脱敏确认说明  ',
          expectedUpdatedAt,
        },
        ConfirmClinicalReportDto,
      ),
    ).resolves.toEqual({
      confirm: true,
      confirmationNote: '脱敏确认说明',
      expectedUpdatedAt,
    });
  });

  it.each([
    [SubmitClinicalReportForConfirmationDto, { confirm: 'true' }],
    [SubmitClinicalReportForConfirmationDto, { submissionNote: 'ab' }],
    [ConfirmClinicalReportDto, { confirm: 'true' }],
    [ConfirmClinicalReportDto, { confirmationNote: 'ab' }],
  ])('rejects malformed workflow body %#', async (metatype, override) => {
    const note =
      metatype === SubmitClinicalReportForConfirmationDto
        ? { submissionNote: 'valid submission note' }
        : { confirmationNote: 'valid confirmation note' };
    await expect(
      transformBody(
        { confirm: true, ...note, expectedUpdatedAt, ...override },
        metatype,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects every extra client-controlled field', async () => {
    for (const field of ['status', 'source', 'metadata', 'confirmation']) {
      await expect(
        transformBody(
          {
            doctorOpinion: 'valid opinion',
            editNote: 'valid edit note',
            expectedUpdatedAt,
            [field]: 'forged',
          },
          UpdateClinicalReportDraftDto,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
