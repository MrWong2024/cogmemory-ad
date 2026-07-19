import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ListPatientAssessmentHistoryQueryDto } from './list-patient-assessment-history-query.dto';
import { PatientHistoryParamDto } from './patient-history-param.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

describe('clinical history DTOs', () => {
  it('applies pagination defaults and normalizes ISO dates and scaleCode', async () => {
    const transformed: unknown = await pipe.transform(
      {
        dateFrom: '2026-07-01T00:00:00.000Z',
        dateTo: '2026-07-19T23:59:59.999Z',
        scaleCode: '  MoCA  ',
      },
      { type: 'query', metatype: ListPatientAssessmentHistoryQueryDto },
    );
    expect(transformed).toBeInstanceOf(ListPatientAssessmentHistoryQueryDto);
    const result = transformed as ListPatientAssessmentHistoryQueryDto;
    expect(result).toMatchObject({ page: 1, pageSize: 20, scaleCode: 'moca' });
    expect(result.dateFrom).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    expect(result.dateTo).toEqual(new Date('2026-07-19T23:59:59.999Z'));
  });

  it.each([
    { page: '0' },
    { pageSize: '101' },
    { dateFrom: '07/19/2026' },
    { dateTo: 'not-a-date' },
    { scaleCode: '   ' },
    { visitType: 'unknown' },
    { status: 'archived' },
    { sort: 'assessmentDate' },
  ])('rejects invalid or unknown query input %#', async (value) => {
    await expect(
      pipe.transform(value, {
        type: 'query',
        metatype: ListPatientAssessmentHistoryQueryDto,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates canonical patient MongoId', async () => {
    await expect(
      pipe.transform(
        { patientId: '507f1f77bcf86cd799439011' },
        { type: 'param', metatype: PatientHistoryParamDto },
      ),
    ).resolves.toBeInstanceOf(PatientHistoryParamDto);
    await expect(
      pipe.transform(
        { patientId: 'not-an-id' },
        { type: 'param', metatype: PatientHistoryParamDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
