import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateClinicalReportCorrectionDto } from './create-clinical-report-correction.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const expectedUpdatedAt = '2026-07-12T08:00:00.000Z';

async function transform(
  value: object,
): Promise<CreateClinicalReportCorrectionDto> {
  return (await pipe.transform(value, {
    type: 'body',
    metatype: CreateClinicalReportCorrectionDto,
  })) as CreateClinicalReportCorrectionDto;
}

describe('CreateClinicalReportCorrectionDto', () => {
  it('accepts the exact body and trims controlled text', async () => {
    await expect(
      transform({
        confirm: true,
        correctionReason: '  脱敏更正原因  ',
        changeSummary: '  脱敏计划变更范围  ',
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      confirm: true,
      correctionReason: '脱敏更正原因',
      changeSummary: '脱敏计划变更范围',
      expectedUpdatedAt,
    });
  });

  it.each([
    { confirm: true, changeSummary: 'valid summary', expectedUpdatedAt },
    {
      confirm: true,
      correctionReason: 'ab',
      changeSummary: 'valid summary',
      expectedUpdatedAt,
    },
    {
      confirm: true,
      correctionReason: 'x'.repeat(2001),
      changeSummary: 'valid summary',
      expectedUpdatedAt,
    },
    {
      confirm: true,
      correctionReason: 'valid reason',
      changeSummary: 'ab',
      expectedUpdatedAt,
    },
    {
      confirm: true,
      correctionReason: 'valid reason',
      changeSummary: 'x'.repeat(4001),
      expectedUpdatedAt,
    },
    {
      confirm: true,
      correctionReason: 'valid reason',
      changeSummary: 'valid summary',
    },
    {
      confirm: true,
      correctionReason: 'valid reason',
      changeSummary: 'valid summary',
      expectedUpdatedAt: '2026-02-30T00:00:00.000Z',
    },
  ])('rejects invalid controlled input %#', async (input) => {
    await expect(transform(input)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([undefined, false, 'true', 1])(
    'leaves confirm=%p to the workflow strict business check',
    async (confirm) => {
      const value = {
        ...(confirm === undefined ? {} : { confirm }),
        correctionReason: 'valid reason',
        changeSummary: 'valid summary',
        expectedUpdatedAt,
      };
      await expect(transform(value)).resolves.toMatchObject(value);
    },
  );

  it('rejects client-controlled fields', async () => {
    for (const field of [
      'status',
      'reportVersion',
      'reportCode',
      'replacementReportId',
      'correctionId',
      'narrative',
      'metadata',
      'correctionRecords',
      'force',
      'resume',
      'cancel',
      'rollback',
      'overwrite',
      'createPdf',
      'useAi',
      'patientId',
      'visitId',
      'reportId',
    ]) {
      await expect(
        transform({
          confirm: true,
          correctionReason: 'valid reason',
          changeSummary: 'valid summary',
          expectedUpdatedAt,
          [field]: 'forged',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
