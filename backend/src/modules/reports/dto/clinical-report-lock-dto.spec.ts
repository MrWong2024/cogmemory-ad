import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { LockClinicalReportDto } from './lock-clinical-report.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const expectedUpdatedAt = '2026-07-12T08:00:00.000Z';

async function transform(value: object): Promise<LockClinicalReportDto> {
  return (await pipe.transform(value, {
    type: 'body',
    metatype: LockClinicalReportDto,
  })) as LockClinicalReportDto;
}

describe('LockClinicalReportDto', () => {
  it('accepts explicit confirmation and trims the lock note', async () => {
    await expect(
      transform({
        confirm: true,
        lockNote: '  脱敏不可逆锁定测试说明  ',
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      confirm: true,
      lockNote: '脱敏不可逆锁定测试说明',
      expectedUpdatedAt,
    });
  });

  it('leaves every non-true confirmation for the workflow business error', async () => {
    await expect(
      transform({ lockNote: 'valid lock note', expectedUpdatedAt }),
    ).resolves.toEqual({ lockNote: 'valid lock note', expectedUpdatedAt });
    await expect(
      transform({
        confirm: false,
        lockNote: 'valid lock note',
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      confirm: false,
      lockNote: 'valid lock note',
      expectedUpdatedAt,
    });
    await expect(
      transform({
        confirm: 'true',
        lockNote: 'valid lock note',
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      confirm: 'true',
      lockNote: 'valid lock note',
      expectedUpdatedAt,
    });
  });

  it.each([
    { confirm: true, expectedUpdatedAt },
    { confirm: true, lockNote: 'ab', expectedUpdatedAt },
    { confirm: true, lockNote: 'x'.repeat(2001), expectedUpdatedAt },
    { confirm: true, lockNote: 'valid lock note' },
    {
      confirm: true,
      lockNote: 'valid lock note',
      expectedUpdatedAt: '2026-02-30T00:00:00.000Z',
    },
  ])('rejects malformed input %#', async (input) => {
    await expect(transform(input)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects all extra client-controlled fields', async () => {
    for (const field of [
      'status',
      'source',
      'qualityStatus',
      'lockedAt',
      'lockedBy',
      'lockId',
      'confirmation',
      'metadata',
      'force',
      'unlock',
      'archiveAfterLock',
      'createPdf',
      'lockSources',
      'sourceResourceIds',
    ]) {
      await expect(
        transform({
          confirm: true,
          lockNote: 'valid lock note',
          expectedUpdatedAt,
          [field]: 'forged',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
