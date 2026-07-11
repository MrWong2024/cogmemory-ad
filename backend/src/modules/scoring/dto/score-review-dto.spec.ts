import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmScoreResultDto } from './confirm-score-result.dto';
import { ReviewScoreItemDto } from './review-score-item.dto';
import { ScoreItemReviewParamDto } from './score-item-review-param.dto';
import { ScoreResultParamDto } from './score-result-param.dto';

const IDS = {
  patientId: '507f1f77bcf86cd799439011',
  visitId: '507f1f77bcf86cd799439012',
  scaleInstanceId: '507f1f77bcf86cd799439013',
  scoreResultId: '507f1f77bcf86cd799439014',
  itemResponseId: '507f1f77bcf86cd799439015',
};

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

describe('A18 score review DTOs', () => {
  it('validates every score result and item review path id as MongoId', async () => {
    await expect(
      validate(plainToInstance(ScoreResultParamDto, IDS)),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(ScoreItemReviewParamDto, IDS)),
    ).resolves.toHaveLength(0);
    for (const field of Object.keys(IDS)) {
      const metatype =
        field === 'itemResponseId'
          ? ScoreItemReviewParamDto
          : ScoreResultParamDto;
      await expect(
        validate(plainToInstance(metatype, { ...IDS, [field]: 'invalid' })),
      ).resolves.not.toHaveLength(0);
    }
  });

  it('accepts finite numeric zero, trims notes and requires an ISO timestamp', async () => {
    const transformed: unknown = await pipe.transform(
      {
        scoreValue: 0,
        reviewNote: '  reviewed manually  ',
        expectedUpdatedAt: '2026-07-11T01:00:00.000Z',
      },
      { type: 'body', metatype: ReviewScoreItemDto },
    );
    expect(transformed).toEqual(
      expect.objectContaining({
        scoreValue: 0,
        reviewNote: 'reviewed manually',
      }),
    );
    for (const scoreValue of ['0', Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        pipe.transform(
          {
            scoreValue,
            reviewNote: 'reviewed manually',
            expectedUpdatedAt: '2026-07-11T01:00:00.000Z',
          },
          { type: 'body', metatype: ReviewScoreItemDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('requires strict confirmation fields and rejects server-controlled input', async () => {
    await expect(
      pipe.transform(
        {
          confirm: true,
          reviewNote: '  final confirmation  ',
          expectedUpdatedAt: '2026-07-11T01:00:00.000Z',
        },
        { type: 'body', metatype: ConfirmScoreResultDto },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        confirm: true,
        reviewNote: 'final confirmation',
      }),
    );
    for (const field of [
      'metadata',
      'reviewerId',
      'status',
      'totalScore',
      'itemScores',
      'force',
    ]) {
      await expect(
        pipe.transform(
          {
            confirm: true,
            reviewNote: 'final confirmation',
            expectedUpdatedAt: '2026-07-11T01:00:00.000Z',
            [field]: 'forged',
          },
          { type: 'body', metatype: ConfirmScoreResultDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        pipe.transform(
          {
            scoreValue: 1,
            reviewNote: 'reviewed manually',
            expectedUpdatedAt: '2026-07-11T01:00:00.000Z',
            [field]: 'forged',
          },
          { type: 'body', metatype: ReviewScoreItemDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
