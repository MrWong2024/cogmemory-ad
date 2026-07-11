import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ComputeCognitiveDomainResultDto } from './compute-cognitive-domain-result.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

describe('ComputeCognitiveDomainResultDto', () => {
  it('accepts only a boolean confirmation field', async () => {
    await expect(
      pipe.transform(
        { confirm: true },
        { type: 'body', metatype: ComputeCognitiveDomainResultDto },
      ),
    ).resolves.toEqual({ confirm: true });
    await expect(
      pipe.transform(
        { confirm: 'true' },
        { type: 'body', metatype: ComputeCognitiveDomainResultDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    'scoreResultId',
    'domainScores',
    'weights',
    'mappingRules',
    'domainCodes',
    'metadata',
    'force',
    'rerun',
    'patientId',
  ])('rejects server-controlled field %s', async (field) => {
    await expect(
      pipe.transform(
        { confirm: true, [field]: 'forged' },
        { type: 'body', metatype: ComputeCognitiveDomainResultDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
