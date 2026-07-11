import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ComputeScoreResultDto } from './compute-score-result.dto';

describe('ComputeScoreResultDto', () => {
  it('accepts booleans and leaves strict true enforcement to the workflow', async () => {
    await expect(
      validate(plainToInstance(ComputeScoreResultDto, { confirm: true })),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(ComputeScoreResultDto, { confirm: false })),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(ComputeScoreResultDto, {})),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(ComputeScoreResultDto, { confirm: 'true' })),
    ).resolves.not.toHaveLength(0);
  });

  it('rejects client scores, rules and server-controlled fields', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    for (const field of [
      'runNo',
      'scoreResultCode',
      'status',
      'scoringSource',
      'scoringMode',
      'itemScores',
      'groupScores',
      'totalScore',
      'score',
      'expectedValue',
      'scoringRule',
      'review',
      'qualityStatus',
      'metadata',
      'force',
      'rerun',
      'override',
      'confirmResult',
      'lockResult',
      'operatorNote',
      'patientId',
      'visitId',
      'scaleInstanceId',
    ]) {
      await expect(
        pipe.transform(
          { confirm: true, [field]: 'forged' },
          { type: 'body', metatype: ComputeScoreResultDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
