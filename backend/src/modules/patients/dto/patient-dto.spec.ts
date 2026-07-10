import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePatientDto } from './create-patient.dto';
import { ListPatientsQueryDto } from './list-patients-query.dto';
import { PatientIdParamDto } from './patient-id-param.dto';

describe('patient DTO validation', () => {
  it('applies list defaults and transforms numeric pagination', async () => {
    const defaults = plainToInstance(ListPatientsQueryDto, {});
    const transformed = plainToInstance(ListPatientsQueryDto, {
      page: '2',
      pageSize: '50',
      keyword: ' sample ',
    });

    expect(await validate(defaults)).toHaveLength(0);
    expect(defaults).toEqual(
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
    expect(await validate(transformed)).toHaveLength(0);
    expect(transformed).toEqual(
      expect.objectContaining({ page: 2, pageSize: 50, keyword: 'sample' }),
    );
  });

  it('rejects pagination bounds and unsupported list filters', async () => {
    const invalid = plainToInstance(ListPatientsQueryDto, {
      page: 0,
      pageSize: 101,
      status: 'deleted',
      sourceType: 'external',
    });

    const errors = await validate(invalid);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['page', 'pageSize', 'status', 'sourceType']),
    );
  });

  it('trims create fields and removes blank tags', async () => {
    const dto = plainToInstance(CreatePatientDto, {
      subjectCode: ' subj-test-dto ',
      displayName: ' Sample DTO ',
      birthDate: '1950-01-01T00:00:00.000Z',
      educationYears: '12',
      tags: [' first ', '', ' second '],
      notes: ' note ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        subjectCode: 'subj-test-dto',
        displayName: 'Sample DTO',
        birthDate: new Date('1950-01-01T00:00:00.000Z'),
        educationYears: 12,
        tags: ['first', 'second'],
        notes: 'note',
      }),
    );
  });

  it('rejects invalid create values', async () => {
    const dto = plainToInstance(CreatePatientDto, {
      subjectCode: '   ',
      sourceType: 'external',
      sex: 'unspecified',
      birthDate: 'not-a-date',
      educationYears: 41,
      handedness: 'both',
      tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`),
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'subjectCode',
        'sourceType',
        'sex',
        'birthDate',
        'educationYears',
        'handedness',
        'tags',
      ]),
    );
  });

  it('rejects invalid patientId', async () => {
    const dto = plainToInstance(PatientIdParamDto, {
      patientId: 'not-a-mongo-id',
    });

    const errors = await validate(dto);
    expect(errors).toEqual([
      expect.objectContaining({ property: 'patientId' }),
    ]);
  });

  it('rejects non-whitelisted patient create fields through ValidationPipe', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          subjectCode: 'SUBJ-TEST-WHITELIST',
          status: 'archived',
          externalRefs: { hidden: true },
          metadata: { hidden: true },
        },
        { type: 'body', metatype: CreatePatientDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
