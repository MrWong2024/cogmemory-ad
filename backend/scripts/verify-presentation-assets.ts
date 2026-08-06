import { HttpException } from '@nestjs/common';
import { readFile, readdir, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { ScaleSeedDataService } from '../src/modules/scales/seeds/scale-seed-data.service';
import {
  calculateFileSha256,
  PresentationAssetsService,
} from '../src/modules/scales/services/presentation-assets.service';

const MMSE_PACKAGE_KEY = 'mmse-1.0-package-001';
const MMSE_SOURCE_PDF = '.local/reference/MMSE+MoCA.pdf';
const MMSE_SOURCE_PDF_SHA256 =
  '9BEB51BC8C509E17F6519154F059817875D861E13F8DE2BD6BBE78FD4DE6E59A';
const MMSE_SOURCE_PDF_PAGE_COUNT = 8;

async function main(): Promise<void> {
  if (process.argv.length > 2) {
    throw new Error('arguments are not supported');
  }

  const presentationAssetsService = new PresentationAssetsService();
  const verifiedPackage =
    await presentationAssetsService.validatePackage(MMSE_PACKAGE_KEY);
  const manifest = verifiedPackage.manifest;

  await assertMmsePackageShape(verifiedPackage);

  const seedDataService = new ScaleSeedDataService();
  const seedValidation = seedDataService.validateScaleSeeds();
  if (!seedValidation.valid) {
    throw new Error('scale seed validation failed');
  }

  const mmseSeed = seedDataService.getScaleVersionSeed('mmse', '1.0');
  if (
    !mmseSeed ||
    mmseSeed.presentationPackageKey !== MMSE_PACKAGE_KEY ||
    !Array.isArray(mmseSeed.patientAdministrationSteps) ||
    mmseSeed.patientAdministrationSteps.length !== 19
  ) {
    throw new Error('MMSE patient presentation seed is invalid');
  }

  const manifestAssetKeys = new Set(
    manifest.assets.map((asset) => asset.assetKey),
  );
  const referencedAssetKeys = new Set<string>();

  for (const step of mmseSeed.patientAdministrationSteps) {
    for (const assetKey of step.assetKeys) {
      if (!manifestAssetKeys.has(assetKey)) {
        throw new Error('MMSE seed references an unknown presentation asset');
      }
      referencedAssetKeys.add(assetKey);
    }
  }

  if (
    referencedAssetKeys.size !== manifestAssetKeys.size ||
    [...manifestAssetKeys].some(
      (assetKey) => !referencedAssetKeys.has(assetKey),
    )
  ) {
    throw new Error('presentation asset package contains an orphaned asset');
  }

  if (
    manifest.sourcePdf !== MMSE_SOURCE_PDF ||
    manifest.sourcePdfSha256 !== MMSE_SOURCE_PDF_SHA256
  ) {
    throw new Error('MMSE source PDF manifest identity is invalid');
  }

  const sourcePdfPath = resolve(process.cwd(), '..', MMSE_SOURCE_PDF);
  const sourcePdfStat = await stat(sourcePdfPath);
  if (!sourcePdfStat.isFile()) {
    throw new Error('MMSE source PDF is missing');
  }

  const sourcePdfBytes = await readFile(sourcePdfPath);
  const sourcePdfSha256 = await calculateFileSha256(sourcePdfPath);
  const sourcePdfPageCount = countPdfPages(sourcePdfBytes);

  if (
    sourcePdfSha256 !== MMSE_SOURCE_PDF_SHA256 ||
    sourcePdfPageCount !== MMSE_SOURCE_PDF_PAGE_COUNT
  ) {
    throw new Error('MMSE source PDF integrity is invalid');
  }

  console.log(
    [
      'presentation-assets verify ok',
      `package=${manifest.packageKey}`,
      `status=${manifest.status}`,
      `reviewedBy=${manifest.reviewedBy}`,
      `reviewedAt=${manifest.reviewedAt}`,
      `assets=${manifest.assets.length}`,
      `steps=${mmseSeed.patientAdministrationSteps.length}`,
      `referencedAssets=${referencedAssetKeys.size}`,
      `sourcePdfPages=${sourcePdfPageCount}`,
      `sourcePdfSha256=${sourcePdfSha256}`,
      'assetHashes=ok',
    ].join(' | '),
  );
}

async function assertMmsePackageShape(
  verifiedPackage: Awaited<
    ReturnType<PresentationAssetsService['validatePackage']>
  >,
): Promise<void> {
  const assets = verifiedPackage.manifest.assets;
  const audioAssets = assets.filter((asset) => asset.kind === 'audio');
  const imageAssets = assets.filter((asset) => asset.kind === 'image');

  if (
    assets.length !== 22 ||
    imageAssets.length !== 1 ||
    audioAssets.length !== 21 ||
    audioAssets.filter((asset) => asset.role === 'guidance').length !== 18 ||
    audioAssets.filter((asset) => asset.role === 'stimulus').length !== 3
  ) {
    throw new Error('MMSE presentation asset counts are invalid');
  }

  const actualFiles = await listFilesRecursively(
    verifiedPackage.packageDirectory,
  );
  const expectedFiles = new Set([
    'manifest.json',
    ...assets.map((asset) => asset.file.replaceAll('\\', '/')),
  ]);

  if (
    actualFiles.length !== 23 ||
    actualFiles.some((file) => !expectedFiles.has(file)) ||
    [...expectedFiles].some((file) => !actualFiles.includes(file))
  ) {
    throw new Error('MMSE presentation package file set is invalid');
  }
}

async function listFilesRecursively(
  directory: string,
  rootDirectory = directory,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(entryPath, rootDirectory)));
    } else if (entry.isFile()) {
      files.push(relative(rootDirectory, entryPath).replaceAll('\\', '/'));
    }
  }

  return files.sort();
}

function countPdfPages(pdfBytes: Buffer): number {
  const pdfText = pdfBytes.toString('latin1');

  if (!pdfText.startsWith('%PDF-')) {
    throw new Error('source file is not a PDF');
  }

  return [...pdfText.matchAll(/\/Type\s*\/Page\b/g)].length;
}

function getSafeErrorCode(error: unknown): string {
  if (error instanceof HttpException) {
    const response: unknown = error.getResponse();
    if (
      typeof response === 'object' &&
      response !== null &&
      'code' in response &&
      typeof response.code === 'string'
    ) {
      return response.code;
    }
  }

  return 'PRESENTATION_ASSET_PACKAGE_INVALID';
}

void main().catch((error: unknown) => {
  console.error(
    `presentation-assets verify failed: ${getSafeErrorCode(error)}`,
  );
  process.exitCode = 1;
});
