import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ClinicalReportHistoryParamDto } from './clinical-report-history-param.dto';
import { ListClinicalReportVersionsQueryDto } from './list-clinical-report-versions-query.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

describe('clinical report history DTOs', () => {
  it('applies list defaults and accepts bounded pagination', async () => {
    await expect(
      pipe.transform(
        {},
        {
          type: 'query',
          metatype: ListClinicalReportVersionsQueryDto,
        },
      ),
    ).resolves.toMatchObject({ page: 1, pageSize: 20 });
    await expect(
      pipe.transform(
        { page: '2', pageSize: '100' },
        { type: 'query', metatype: ListClinicalReportVersionsQueryDto },
      ),
    ).resolves.toMatchObject({ page: 2, pageSize: 100 });
  });

  it.each([
    { page: '0' },
    { pageSize: '0' },
    { pageSize: '101' },
    { sort: 'version' },
    { reportType: 'cognitive_assessment' },
    { lineage: 'true' },
  ])('rejects invalid or forbidden list query %#', async (value) => {
    await expect(
      pipe.transform(value, {
        type: 'query',
        metatype: ListClinicalReportVersionsQueryDto,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates all detail ownership params as MongoIds', async () => {
    const valid = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
      reportId: '507f1f77bcf86cd799439013',
    };
    await expect(
      pipe.transform(valid, {
        type: 'param',
        metatype: ClinicalReportHistoryParamDto,
      }),
    ).resolves.toMatchObject(valid);
    await expect(
      pipe.transform(
        { ...valid, reportId: 'not-an-id' },
        { type: 'param', metatype: ClinicalReportHistoryParamDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
