import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ItemResponseDraftParamDto } from './item-response-draft-param.dto';
import { ScaleInstanceExecutionParamDto } from './scale-instance-execution-param.dto';
import { UpdateItemResponseDraftDto } from './update-item-response-draft.dto';

describe('item response draft DTO validation', () => {
  it('validates every MongoId in GET and PATCH path DTOs', async () => {
    const ids = {
      patientId: '507f1f77bcf86cd799439011',
      visitId: '507f1f77bcf86cd799439012',
      scaleInstanceId: '507f1f77bcf86cd799439013',
      itemResponseId: '507f1f77bcf86cd799439014',
    };
    expect(
      await validate(plainToInstance(ScaleInstanceExecutionParamDto, ids)),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(ItemResponseDraftParamDto, ids)),
    ).toHaveLength(0);

    const invalid = plainToInstance(ItemResponseDraftParamDto, {
      patientId: 'bad',
      visitId: 'bad',
      scaleInstanceId: 'bad',
      itemResponseId: 'bad',
    });
    expect((await validate(invalid)).map((error) => error.property)).toEqual(
      expect.arrayContaining(Object.keys(ids)),
    );
  });

  it('transforms nested draft fields and accepts nullable values', async () => {
    const dto = plainToInstance(UpdateItemResponseDraftDto, {
      rawResponse: false,
      structuredResponse: { recalled: true },
      responseText: ' answer text ',
      missingReason: null,
      stepResponses: [
        { stepCode: ' MMSE.STEP_1 ', actualValue: 93, note: ' note ' },
      ],
      promptResponses: [
        {
          promptType: 'semantic_category',
          order: 1,
          responseAfterPrompt: 'word',
          note: null,
        },
      ],
      timing: {
        startedAt: '2026-07-01T08:00:00.000Z',
        durationMs: 1000,
        timerSource: 'manual',
      },
      operatorNote: ' operator note ',
      markAsAnswered: true,
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.responseText).toBe('answer text');
    expect(dto.stepResponses?.[0]).toEqual(
      expect.objectContaining({ stepCode: 'mmse.step_1', note: 'note' }),
    );
    expect(dto.operatorNote).toBe('operator note');
  });

  it('rejects invalid nested prompt and timing fields', async () => {
    const dto = plainToInstance(UpdateItemResponseDraftDto, {
      promptResponses: [
        { promptType: 'invented', order: 0, responseAfterPrompt: true },
      ],
      timing: {
        startedAt: 'not-a-date',
        durationMs: -1,
        timerSource: 'browser',
      },
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['promptResponses', 'timing']),
    );
  });

  it('rejects server-controlled fields through the global pipe contract', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    for (const field of [
      'itemCode',
      'crfCode',
      'groupCode',
      'itemTitle',
      'itemOrder',
      'responseType',
      'countsTowardTotal',
      'cognitiveDomainCodes',
      'itemConfigSnapshot',
      'versionTrace',
      'answerSource',
      'score',
      'scoreValue',
      'scoreStatus',
      'status',
      'evidenceRefs',
      'mediaEvidenceId',
      'qualityControlHints',
      'metadata',
      'patientId',
      'visitId',
      'scaleInstanceId',
      'createdAt',
      'updatedAt',
    ]) {
      await expect(
        pipe.transform(
          { responseText: 'safe', [field]: 'forged' },
          { type: 'body', metatype: UpdateItemResponseDraftDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('rejects server-controlled nested step and prompt fields', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          stepResponses: [
            {
              stepCode: 'step_1',
              actualValue: 93,
              expectedValue: 93,
              isCorrect: true,
              scoreValue: 1,
              countsTowardItemScore: false,
            },
          ],
        },
        { type: 'body', metatype: UpdateItemResponseDraftDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      pipe.transform(
        {
          promptResponses: [
            {
              promptType: 'semantic_category',
              order: 1,
              responseAfterPrompt: 'word',
              promptText: 'forged',
              isCorrect: true,
              countsTowardScore: true,
            },
          ],
        },
        { type: 'body', metatype: UpdateItemResponseDraftDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
