import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubmitScaleInstanceDto } from './submit-scale-instance.dto';

describe('SubmitScaleInstanceDto', () => {
  it('accepts boolean confirmation while leaving explicit true enforcement to the service', async () => {
    await expect(
      validate(plainToInstance(SubmitScaleInstanceDto, { confirm: true })),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(SubmitScaleInstanceDto, { confirm: false })),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(SubmitScaleInstanceDto, {})),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(SubmitScaleInstanceDto, { confirm: 'true' })),
    ).resolves.not.toHaveLength(0);
  });

  it('rejects every server-controlled or override field through the global pipe contract', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    for (const field of [
      'status',
      'completedAt',
      'startedAt',
      'durationMs',
      'operatorSnapshot',
      'submittedBy',
      'submittedAt',
      'progress',
      'metadata',
      'qualityControlSummary',
      'score',
      'force',
      'ignoreIssues',
      'override',
      'itemResponses',
      'evidence',
      'visitStatus',
      'lockAfterSubmit',
    ]) {
      await expect(
        pipe.transform(
          { confirm: true, [field]: 'forged' },
          { type: 'body', metatype: SubmitScaleInstanceDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
