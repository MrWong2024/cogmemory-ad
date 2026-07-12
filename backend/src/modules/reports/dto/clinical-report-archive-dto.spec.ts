import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ArchiveClinicalReportDto } from './archive-clinical-report.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const expectedUpdatedAt = '2026-07-12T08:00:00.000Z';

async function transform(value: object): Promise<ArchiveClinicalReportDto> {
  return (await pipe.transform(value, {
    type: 'body',
    metatype: ArchiveClinicalReportDto,
  })) as ArchiveClinicalReportDto;
}

describe('ArchiveClinicalReportDto', () => {
  it('accepts explicit confirmation and trims the archive note', async () => {
    await expect(
      transform({
        confirm: true,
        archiveNote: '  脱敏归档测试说明  ',
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      confirm: true,
      archiveNote: '脱敏归档测试说明',
      expectedUpdatedAt,
    });
  });

  it('leaves non-true confirmation to the workflow business error', async () => {
    await expect(
      transform({
        archiveNote: 'valid archive note',
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      archiveNote: 'valid archive note',
      expectedUpdatedAt,
    });
    await expect(
      transform({
        confirm: false,
        archiveNote: 'valid archive note',
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      confirm: false,
      archiveNote: 'valid archive note',
      expectedUpdatedAt,
    });
    await expect(
      transform({
        confirm: 'true',
        archiveNote: 'valid archive note',
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      confirm: 'true',
      archiveNote: 'valid archive note',
      expectedUpdatedAt,
    });
  });

  it.each([
    { confirm: true, expectedUpdatedAt },
    { confirm: true, archiveNote: 'ab', expectedUpdatedAt },
    { confirm: true, archiveNote: 'x'.repeat(2001), expectedUpdatedAt },
    { confirm: true, archiveNote: 'valid archive note' },
    {
      confirm: true,
      archiveNote: 'valid archive note',
      expectedUpdatedAt: '2026-02-30T00:00:00.000Z',
    },
  ])('rejects malformed input %#', async (input) => {
    await expect(transform(input)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects all client-controlled fields', async () => {
    for (const field of [
      'status',
      'source',
      'qualityStatus',
      'archivedAt',
      'archivedBy',
      'archiveId',
      'archive',
      'actor',
      'lockedAt',
      'lockedBy',
      'sourceFreeze',
      'confirmation',
      'correctionRecords',
      'voidedAt',
      'metadata',
      'force',
      'unarchive',
      'correct',
      'void',
      'createPdf',
      'patientId',
      'visitId',
      'reportId',
    ]) {
      await expect(
        transform({
          confirm: true,
          archiveNote: 'valid archive note',
          expectedUpdatedAt,
          [field]: 'forged',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
