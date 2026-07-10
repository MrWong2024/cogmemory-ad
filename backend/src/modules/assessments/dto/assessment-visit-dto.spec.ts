import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAssessmentVisitDto } from './create-assessment-visit.dto';
import { ListAssessmentVisitsQueryDto } from './list-assessment-visits-query.dto';
import { PatientVisitsParamDto } from './patient-visits-param.dto';

describe('assessment visit DTO validation', () => {
  it('applies list defaults and transforms pagination and date filters', async () => {
    const defaults = plainToInstance(ListAssessmentVisitsQueryDto, {});
    const transformed = plainToInstance(ListAssessmentVisitsQueryDto, {
      page: '2',
      pageSize: '50',
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-01-31T23:59:59.999Z',
    });

    expect(await validate(defaults)).toHaveLength(0);
    expect(defaults).toEqual(
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
    expect(await validate(transformed)).toHaveLength(0);
    expect(transformed).toEqual(
      expect.objectContaining({
        page: 2,
        pageSize: 50,
        dateFrom: new Date('2026-01-01T00:00:00.000Z'),
        dateTo: new Date('2026-01-31T23:59:59.999Z'),
      }),
    );
  });

  it('rejects list pagination, enum, and date validation errors', async () => {
    const dto = plainToInstance(ListAssessmentVisitsQueryDto, {
      page: 0,
      pageSize: 101,
      status: 'pending',
      visitType: 'remote',
      dateFrom: 'not-a-date',
      dateTo: 'also-not-a-date',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'page',
        'pageSize',
        'status',
        'visitType',
        'dateFrom',
        'dateTo',
      ]),
    );
  });

  it('trims visit create fields and transforms assessmentDate', async () => {
    const dto = plainToInstance(CreateAssessmentVisitDto, {
      visitCode: ' visit-a12-dto ',
      visitType: 'follow_up',
      assessmentDate: '2026-02-01T08:00:00.000Z',
      notes: ' visit note ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        visitCode: 'visit-a12-dto',
        visitType: 'follow_up',
        assessmentDate: new Date('2026-02-01T08:00:00.000Z'),
        notes: 'visit note',
      }),
    );
  });

  it('rejects missing or invalid visit create fields', async () => {
    const dto = plainToInstance(CreateAssessmentVisitDto, {
      visitCode: '   ',
      visitType: 'remote',
      assessmentDate: 'not-a-date',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['visitCode', 'visitType', 'assessmentDate']),
    );
  });

  it('rejects an invalid patientId', async () => {
    const dto = plainToInstance(PatientVisitsParamDto, {
      patientId: 'not-a-mongo-id',
    });

    expect(await validate(dto)).toEqual([
      expect.objectContaining({ property: 'patientId' }),
    ]);
  });

  it('rejects all server-owned visit fields through ValidationPipe', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          visitCode: 'VISIT-A12-WHITELIST',
          assessmentDate: '2026-01-01T08:00:00.000Z',
          patientId: '507f1f77bcf86cd799439011',
          subjectCode: 'FORGED',
          status: 'completed',
          operatorSnapshot: { operatorName: 'Forged' },
          completedAt: '2026-01-01T09:00:00.000Z',
          clinicalContext: { hidden: true },
          metadata: { hidden: true },
        },
        { type: 'body', metatype: CreateAssessmentVisitDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
