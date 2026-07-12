import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { FreezeClinicalReportSourcesDto } from './freeze-clinical-report-sources.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const expectedUpdatedAt = '2026-07-12T08:00:00.000Z';

async function transform(
  value: object,
): Promise<FreezeClinicalReportSourcesDto> {
  return (await pipe.transform(value, {
    type: 'body',
    metatype: FreezeClinicalReportSourcesDto,
  })) as FreezeClinicalReportSourcesDto;
}

describe('FreezeClinicalReportSourcesDto', () => {
  it('accepts confirmation and trims the freeze note', async () => {
    await expect(
      transform({
        confirm: true,
        freezeNote: '  脱敏来源冻结测试说明  ',
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      confirm: true,
      freezeNote: '脱敏来源冻结测试说明',
      expectedUpdatedAt,
    });
  });

  it('leaves missing, false and string confirmation to the workflow', async () => {
    await expect(
      transform({ freezeNote: 'valid freeze note', expectedUpdatedAt }),
    ).resolves.toEqual({ freezeNote: 'valid freeze note', expectedUpdatedAt });
    await expect(
      transform({
        confirm: false,
        freezeNote: 'valid freeze note',
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      confirm: false,
      freezeNote: 'valid freeze note',
      expectedUpdatedAt,
    });
    await expect(
      transform({
        confirm: 'true',
        freezeNote: 'valid freeze note',
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      confirm: 'true',
      freezeNote: 'valid freeze note',
      expectedUpdatedAt,
    });
  });

  it.each([
    { confirm: true, expectedUpdatedAt },
    { confirm: true, freezeNote: 'ab', expectedUpdatedAt },
    { confirm: true, freezeNote: 'x'.repeat(2001), expectedUpdatedAt },
    { confirm: true, freezeNote: 'valid freeze note' },
    {
      confirm: true,
      freezeNote: 'valid freeze note',
      expectedUpdatedAt: '2026-02-30T00:00:00.000Z',
    },
  ])('rejects malformed input %#', async (input) => {
    await expect(transform(input)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects client-controlled source and operation fields', async () => {
    for (const field of [
      'status',
      'source',
      'qualityStatus',
      'lockedAt',
      'lockedBy',
      'sourceFreeze',
      'freezeId',
      'primaryScaleInstanceIds',
      'itemResponseIds',
      'scoreResultIds',
      'cognitiveDomainResultIds',
      'mediaEvidenceIds',
      'metadata',
      'force',
      'retry',
      'resume',
      'unfreeze',
      'unlock',
      'lockVisit',
      'lockPatient',
      'lockStorage',
    ]) {
      await expect(
        transform({
          confirm: true,
          freezeNote: 'valid freeze note',
          expectedUpdatedAt,
          [field]: 'forged',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
