import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ClinicalReportVisitParamDto } from './clinical-report-visit-param.dto';
import { GenerateClinicalReportDto } from './generate-clinical-report.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const id1 = '507f1f77bcf86cd799439011';
const id2 = '507f1f77bcf86cd799439012';

describe('ClinicalReport DTOs', () => {
  it('validates both visit path MongoIds', async () => {
    await expect(
      pipe.transform(
        { patientId: id1, visitId: id2 },
        { type: 'param', metatype: ClinicalReportVisitParamDto },
      ),
    ).resolves.toEqual({ patientId: id1, visitId: id2 });
    await expect(
      pipe.transform(
        { patientId: 'invalid', visitId: id2 },
        { type: 'param', metatype: ClinicalReportVisitParamDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes scope ids and accepts one to ten unique ids', async () => {
    await expect(
      pipe.transform(
        { confirm: true, primaryScaleInstanceIds: [` ${id1.toUpperCase()} `] },
        { type: 'body', metatype: GenerateClinicalReportDto },
      ),
    ).resolves.toEqual({ confirm: true, primaryScaleInstanceIds: [id1] });
    const tenIds = Array.from(
      { length: 10 },
      (_value, index) => `507f1f77bcf86cd7994390${index + 10}`,
    );
    await expect(
      pipe.transform(
        { confirm: true, primaryScaleInstanceIds: tenIds },
        { type: 'body', metatype: GenerateClinicalReportDto },
      ),
    ).resolves.toBeInstanceOf(GenerateClinicalReportDto);
  });

  it('rejects invalid confirmation and invalid scope arrays', async () => {
    for (const input of [
      { confirm: 'true', primaryScaleInstanceIds: [id1] },
      { confirm: true, primaryScaleInstanceIds: [] },
      { confirm: true, primaryScaleInstanceIds: [id1, id1.toUpperCase()] },
      {
        confirm: true,
        primaryScaleInstanceIds: Array.from(
          { length: 11 },
          (_value, index) => `507f1f77bcf86cd7994390${index + 10}`,
        ),
      },
      { confirm: true, primaryScaleInstanceIds: ['invalid'] },
    ]) {
      await expect(
        pipe.transform(input, {
          type: 'body',
          metatype: GenerateClinicalReportDto,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it.each([
    'status',
    'narrative',
    'scoreSnapshots',
    'metadata',
    'useAi',
    'force',
    'reportCode',
  ])('rejects server-controlled field %s', async (field) => {
    await expect(
      pipe.transform(
        {
          confirm: true,
          primaryScaleInstanceIds: [id1],
          [field]: 'forged',
        },
        { type: 'body', metatype: GenerateClinicalReportDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
