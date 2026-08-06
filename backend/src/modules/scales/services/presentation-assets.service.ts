import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { open, readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep, win32 } from 'node:path';

const PACKAGE_KEY_PATTERN =
  /^([a-z][a-z0-9]*)-([0-9]+(?:\.[0-9]+)*)-(package-[0-9]+)$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

export type PresentationAssetKind = 'audio' | 'image';

export type PresentationAssetManifestEntry = {
  assetKey: string;
  stepKey?: string;
  kind: PresentationAssetKind;
  role?: string;
  mimeType: string;
  file: string;
  spokenText?: string;
  sourcePage?: number;
  sha256: string;
};

export type ReleasedPresentationAssetManifest = {
  packageKey: string;
  scaleCode: string;
  scaleVersion: string;
  status: 'released';
  sourcePdf: string;
  sourcePdfSha256: string;
  reviewedBy: string;
  reviewedAt: string;
  assets: PresentationAssetManifestEntry[];
};

export type VerifiedPresentationAsset = PresentationAssetManifestEntry & {
  filePath: string;
  size: number;
};

export type VerifiedPresentationAssetPackage = {
  packageDirectory: string;
  manifestPath: string;
  manifest: ReleasedPresentationAssetManifest;
  assets: VerifiedPresentationAsset[];
};

export type OpenedPresentationAsset = {
  assetKey: string;
  kind: PresentationAssetKind;
  mimeType: string;
  size: number;
  stream: ReadStream;
};

type ParsedPackageKey = {
  scaleCode: string;
  scaleVersion: string;
  packageDirectoryName: string;
};

@Injectable()
export class PresentationAssetsService {
  async validatePackage(
    packageKey: string,
  ): Promise<VerifiedPresentationAssetPackage> {
    try {
      return await verifyPresentationAssetPackage(
        resolvePresentationAssetsRoot(),
        packageKey,
      );
    } catch {
      throwPackageInvalid();
    }
  }

  async openAsset(
    packageKey: string,
    assetKey: string,
  ): Promise<OpenedPresentationAsset> {
    const verifiedPackage = await this.validatePackage(packageKey);
    const asset = verifiedPackage.assets.find(
      (candidate) => candidate.assetKey === assetKey,
    );

    if (!asset) {
      throw new NotFoundException({
        code: 'PRESENTATION_ASSET_NOT_FOUND',
        message: 'Presentation asset was not found',
      });
    }

    try {
      const fileHandle = await open(asset.filePath, 'r');
      return {
        assetKey: asset.assetKey,
        kind: asset.kind,
        mimeType: asset.mimeType,
        size: asset.size,
        stream: fileHandle.createReadStream(),
      };
    } catch {
      throwPackageInvalid();
    }
  }
}

export function resolvePresentationAssetsRoot(
  workingDirectory = process.cwd(),
): string {
  return resolve(workingDirectory, '..', '.local', 'presentation-assets');
}

export async function verifyPresentationAssetPackage(
  presentationAssetsRoot: string,
  packageKey: string,
): Promise<VerifiedPresentationAssetPackage> {
  const parsedPackageKey = parsePackageKey(packageKey);
  const rootPath = await realpath(presentationAssetsRoot);
  const packagePath = resolve(
    rootPath,
    parsedPackageKey.scaleCode,
    parsedPackageKey.scaleVersion,
    parsedPackageKey.packageDirectoryName,
  );
  assertPathWithin(rootPath, packagePath);

  const packageDirectory = await realpath(packagePath);
  assertPathWithin(rootPath, packageDirectory);

  const manifestPath = await realpath(
    resolve(packageDirectory, 'manifest.json'),
  );
  assertPathWithin(packageDirectory, manifestPath);

  const manifest = parseReleasedManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
    parsedPackageKey,
    packageKey,
  );
  const assetKeys = new Set<string>();
  const files = new Set<string>();
  const assets: VerifiedPresentationAsset[] = [];

  for (const asset of manifest.assets) {
    if (assetKeys.has(asset.assetKey)) {
      throw new Error('duplicate asset key');
    }
    assetKeys.add(asset.assetKey);

    const normalizedFile = asset.file.replaceAll('\\', '/').toLowerCase();
    if (files.has(normalizedFile)) {
      throw new Error('duplicate asset file');
    }
    files.add(normalizedFile);

    validateAssetContract(asset);
    const filePath = await resolvePackageAssetPath(
      packageDirectory,
      asset.file,
    );
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      throw new Error('asset is not a file');
    }

    const sha256 = await calculateFileSha256(filePath);
    if (sha256 !== asset.sha256.toUpperCase()) {
      throw new Error('asset hash mismatch');
    }

    assets.push({
      ...asset,
      sha256,
      filePath,
      size: fileStat.size,
    });
  }

  return {
    packageDirectory,
    manifestPath,
    manifest,
    assets,
  };
}

export async function calculateFileSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return hash.digest('hex').toUpperCase();
}

function parsePackageKey(packageKey: string): ParsedPackageKey {
  const match = PACKAGE_KEY_PATTERN.exec(packageKey);

  if (!match) {
    throw new Error('invalid package key');
  }

  return {
    scaleCode: match[1],
    scaleVersion: match[2],
    packageDirectoryName: match[3],
  };
}

function parseReleasedManifest(
  value: unknown,
  parsedPackageKey: ParsedPackageKey,
  packageKey: string,
): ReleasedPresentationAssetManifest {
  if (!isRecord(value) || !Array.isArray(value.assets)) {
    throw new Error('invalid manifest');
  }

  const manifestPackageKey = readNonEmptyString(value.packageKey);
  const scaleCode = readNonEmptyString(value.scaleCode);
  const scaleVersion = readNonEmptyString(value.scaleVersion);
  const status = readNonEmptyString(value.status);
  const sourcePdf = readNonEmptyString(value.sourcePdf);
  const sourcePdfSha256 = readSha256(value.sourcePdfSha256);
  const reviewedBy = readNonEmptyString(value.reviewedBy);
  const reviewedAt = readNonEmptyString(value.reviewedAt);

  if (
    manifestPackageKey !== packageKey ||
    scaleCode !== parsedPackageKey.scaleCode ||
    scaleVersion !== parsedPackageKey.scaleVersion ||
    status !== 'released' ||
    !isCanonicalUtcIsoTimestamp(reviewedAt)
  ) {
    throw new Error('manifest identity or release state is invalid');
  }

  return {
    packageKey: manifestPackageKey,
    scaleCode,
    scaleVersion,
    status: 'released',
    sourcePdf,
    sourcePdfSha256,
    reviewedBy,
    reviewedAt,
    assets: value.assets.map((asset) => parseManifestAsset(asset)),
  };
}

function parseManifestAsset(value: unknown): PresentationAssetManifestEntry {
  if (!isRecord(value)) {
    throw new Error('invalid manifest asset');
  }

  const kind = readNonEmptyString(value.kind);
  if (kind !== 'audio' && kind !== 'image') {
    throw new Error('invalid asset kind');
  }

  return {
    assetKey: readNonEmptyString(value.assetKey),
    stepKey: readOptionalString(value.stepKey),
    kind,
    role: readOptionalString(value.role),
    mimeType: readNonEmptyString(value.mimeType),
    file: readNonEmptyString(value.file),
    spokenText: readOptionalString(value.spokenText),
    sourcePage:
      typeof value.sourcePage === 'number' ? value.sourcePage : undefined,
    sha256: readSha256(value.sha256),
  };
}

function validateAssetContract(asset: PresentationAssetManifestEntry) {
  const extension = extname(asset.file).toLowerCase();

  if (
    (asset.kind === 'audio' &&
      (asset.mimeType !== 'audio/mpeg' || extension !== '.mp3')) ||
    (asset.kind === 'image' &&
      (asset.mimeType !== 'image/png' || extension !== '.png'))
  ) {
    throw new Error('asset MIME or extension mismatch');
  }

  validateRelativeFilePath(asset.file);
}

async function resolvePackageAssetPath(
  packageDirectory: string,
  relativeFilePath: string,
): Promise<string> {
  const pathSegments = relativeFilePath.split(/[\\/]/);
  const unresolvedPath = resolve(packageDirectory, ...pathSegments);
  assertPathWithin(packageDirectory, unresolvedPath);

  const resolvedPath = await realpath(unresolvedPath);
  assertPathWithin(packageDirectory, resolvedPath);
  return resolvedPath;
}

function validateRelativeFilePath(filePath: string) {
  const pathSegments = filePath.split(/[\\/]/);

  if (
    isAbsolute(filePath) ||
    win32.isAbsolute(filePath) ||
    pathSegments.some(
      (segment) => !segment || segment === '.' || segment === '..',
    )
  ) {
    throw new Error('asset file path is invalid');
  }
}

function assertPathWithin(parentPath: string, childPath: string) {
  const relativePath = relative(parentPath, childPath);

  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error('path escapes package root');
  }
}

function readNonEmptyString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('required string is missing');
  }

  return value;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readSha256(value: unknown): string {
  const sha256 = readNonEmptyString(value);

  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error('invalid SHA-256');
  }

  return sha256.toUpperCase();
}

function isCanonicalUtcIsoTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwPackageInvalid(): never {
  throw new InternalServerErrorException({
    code: 'PRESENTATION_ASSET_PACKAGE_INVALID',
    message: 'Presentation asset package is invalid',
  });
}
