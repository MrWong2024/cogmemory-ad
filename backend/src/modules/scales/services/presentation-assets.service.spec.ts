import { HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PresentationAssetsService,
  resolvePresentationAssetsRoot,
} from './presentation-assets.service';

type FixtureAsset = {
  assetKey: string;
  stepKey: string;
  kind: 'audio' | 'image';
  role?: string;
  mimeType: string;
  file: string;
  sha256: string;
};

type FixtureManifest = {
  packageKey: string;
  scaleCode: string;
  scaleVersion: string;
  status: string;
  sourcePdf: string;
  sourcePdfSha256: string;
  reviewedBy?: string;
  reviewedAt?: string;
  assets: FixtureAsset[];
};

async function expectHttpExceptionCode(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  let caughtError: unknown;

  try {
    await promise;
  } catch (error: unknown) {
    caughtError = error;
  }

  expect(caughtError).toBeInstanceOf(HttpException);

  if (!(caughtError instanceof HttpException)) {
    throw caughtError;
  }

  expect(caughtError.getStatus()).toBe(status);
  expect(caughtError.getResponse()).toEqual(expect.objectContaining({ code }));
}

describe('PresentationAssetsService', () => {
  const packageKey = 'mmse-1.0-package-001';
  const originalWorkingDirectory = process.cwd();
  const audioBytes = Buffer.from('fixture-audio');
  const imageBytes = Buffer.from('fixture-image');
  let temporaryRoot: string;
  let backendDirectory: string;
  let packageDirectory: string;
  let manifestPath: string;
  let manifest: FixtureManifest;
  let service: PresentationAssetsService;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(
      join(tmpdir(), 'cogmemory-presentation-assets-'),
    );
    backendDirectory = join(temporaryRoot, 'backend');
    packageDirectory = join(
      temporaryRoot,
      '.local',
      'presentation-assets',
      'mmse',
      '1.0',
      'package-001',
    );
    manifestPath = join(packageDirectory, 'manifest.json');

    await mkdir(backendDirectory, { recursive: true });
    await mkdir(join(packageDirectory, 'audio'), { recursive: true });
    await mkdir(join(packageDirectory, 'images'), { recursive: true });
    await writeFile(
      join(packageDirectory, 'audio', 'guidance.mp3'),
      audioBytes,
    );
    await writeFile(
      join(packageDirectory, 'images', 'stimulus.png'),
      imageBytes,
    );

    manifest = {
      packageKey,
      scaleCode: 'mmse',
      scaleVersion: '1.0',
      status: 'released',
      sourcePdf: '.local/reference/MMSE+MoCA.pdf',
      sourcePdfSha256: sha256(Buffer.from('fixture-pdf')),
      reviewedBy: 'Fixture Reviewer',
      reviewedAt: '2026-08-06T08:00:00.000Z',
      assets: [
        {
          assetKey: 'fixture-guidance',
          stepKey: 'fixture-step',
          kind: 'audio',
          role: 'guidance',
          mimeType: 'audio/mpeg',
          file: 'audio/guidance.mp3',
          sha256: sha256(audioBytes),
        },
        {
          assetKey: 'fixture-stimulus',
          stepKey: 'fixture-step',
          kind: 'image',
          mimeType: 'image/png',
          file: 'images/stimulus.png',
          sha256: sha256(imageBytes),
        },
      ],
    };
    await writeManifest();

    process.chdir(backendDirectory);
    service = new PresentationAssetsService();
  });

  afterEach(async () => {
    process.chdir(originalWorkingDirectory);
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it('validates a released package and opens an asset as a read-only stream', async () => {
    expect(resolvePresentationAssetsRoot()).toBe(
      join(temporaryRoot, '.local', 'presentation-assets'),
    );

    const verifiedPackage = await service.validatePackage(packageKey);

    expect(verifiedPackage.manifest).toEqual(
      expect.objectContaining({
        packageKey,
        status: 'released',
        reviewedBy: 'Fixture Reviewer',
        reviewedAt: '2026-08-06T08:00:00.000Z',
      }),
    );
    expect(verifiedPackage.assets).toHaveLength(2);
    expect(verifiedPackage.assets.map((asset) => asset.assetKey)).toEqual([
      'fixture-guidance',
      'fixture-stimulus',
    ]);

    const openedAsset = await service.openAsset(packageKey, 'fixture-guidance');
    expect(openedAsset).toEqual(
      expect.objectContaining({
        assetKey: 'fixture-guidance',
        kind: 'audio',
        mimeType: 'audio/mpeg',
        size: audioBytes.length,
      }),
    );
    expect(await readStream(openedAsset.stream)).toEqual(audioBytes);
  });

  it('rejects draft packages', async () => {
    manifest.status = 'draft';
    await writeManifest();

    await expectPackageInvalid(service.validatePackage(packageKey));
  });

  it.each(['reviewedBy', 'reviewedAt'] as const)(
    'rejects a missing %s release review field',
    async (field) => {
      delete manifest[field];
      await writeManifest();

      await expectPackageInvalid(service.validatePackage(packageKey));
    },
  );

  it('rejects package and manifest path traversal', async () => {
    await expectPackageInvalid(
      service.validatePackage('../mmse-1.0-package-001'),
    );

    manifest.assets[0].file = '../outside.mp3';
    await writeFile(join(packageDirectory, '..', 'outside.mp3'), audioBytes);
    await writeManifest();

    await expectPackageInvalid(service.validatePackage(packageKey));
  });

  it('rejects a missing asset file', async () => {
    await rm(join(packageDirectory, 'audio', 'guidance.mp3'));

    await expectPackageInvalid(service.validatePackage(packageKey));
  });

  it('rejects an asset hash mismatch', async () => {
    await writeFile(
      join(packageDirectory, 'audio', 'guidance.mp3'),
      Buffer.from('changed-audio'),
    );

    await expectPackageInvalid(service.validatePackage(packageKey));
  });

  it.each([
    ['packageKey', 'moca-1.0-package-001'],
    ['scaleCode', 'moca'],
    ['scaleVersion', '9.9'],
  ] as const)(
    'rejects a manifest %s that does not match the package key',
    async (field, value) => {
      manifest[field] = value;
      await writeManifest();

      await expectPackageInvalid(service.validatePackage(packageKey));
    },
  );

  it('rejects a MIME contract mismatch', async () => {
    manifest.assets[0].mimeType = 'audio/wav';
    await writeManifest();

    await expectPackageInvalid(service.validatePackage(packageKey));
  });

  it('returns the stable not-found error for an unknown assetKey', async () => {
    await expectHttpExceptionCode(
      service.openAsset(packageKey, 'unknown-asset'),
      404,
      'PRESENTATION_ASSET_NOT_FOUND',
    );
  });

  async function writeManifest(): Promise<void> {
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
});

async function expectPackageInvalid(promise: Promise<unknown>): Promise<void> {
  await expectHttpExceptionCode(
    promise,
    500,
    'PRESENTATION_ASSET_PACKAGE_INVALID',
  );
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex').toUpperCase();
}

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks);
}
