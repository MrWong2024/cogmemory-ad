import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InitializeScaleInstanceDto } from './initialize-scale-instance.dto';
import { PatientVisitParamDto } from './patient-visit-param.dto';

describe('assessment execution DTO validation', () => {
  it('validates both patient and visit MongoId path params', async () => {
    const valid = plainToInstance(PatientVisitParamDto, {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
    });
    const invalid = plainToInstance(PatientVisitParamDto, {
      patientId: 'invalid-patient',
      visitId: 'invalid-visit',
    });

    expect(await validate(valid)).toHaveLength(0);
    expect((await validate(invalid)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['patientId', 'visitId']),
    );
  });

  it('normalizes scale code and version and applies the administration default', async () => {
    const dto = plainToInstance(InitializeScaleInstanceDto, {
      scaleCode: '  MoCA  ',
      scaleVersion: ' 1.0 ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        scaleCode: 'moca',
        scaleVersion: '1.0',
        administrationMode: 'clinician_administered',
      }),
    );
  });

  it('accepts only the three supervised administration modes', async () => {
    for (const administrationMode of [
      'clinician_administered',
      'supervised_patient_input',
      'paper_import',
    ]) {
      const dto = plainToInstance(InitializeScaleInstanceDto, {
        scaleCode: 'mmse',
        administrationMode,
      });
      expect(await validate(dto)).toHaveLength(0);
    }

    const invalid = plainToInstance(InitializeScaleInstanceDto, {
      scaleCode: 'mmse',
      administrationMode: 'unsupervised_home_self_test',
    });
    expect((await validate(invalid)).map((error) => error.property)).toContain(
      'administrationMode',
    );
  });

  it('rejects empty and overlong scale fields', async () => {
    const dto = plainToInstance(InitializeScaleInstanceDto, {
      scaleCode: '   ',
      scaleVersion: 'v'.repeat(41),
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['scaleCode', 'scaleVersion']),
    );
  });

  it('rejects every server-owned scale instance field through ValidationPipe', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    for (const field of [
      'patientId',
      'assessmentVisitId',
      'subjectCode',
      'scaleDefinitionId',
      'scaleVersionId',
      'instanceCode',
      'instanceNo',
      'status',
      'operatorSnapshot',
      'startedAt',
      'completedAt',
      'lockedAt',
      'voidedAt',
      'durationMs',
      'progress',
      'qualityControlSummary',
      'metadata',
      'itemResponses',
      'score',
      'report',
      'createdAt',
      'updatedAt',
    ]) {
      await expect(
        pipe.transform(
          { scaleCode: 'mmse', [field]: 'forged' },
          { type: 'body', metatype: InitializeScaleInstanceDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
