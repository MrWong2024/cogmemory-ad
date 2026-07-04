// backend/src/common/utils/uploaded-filename.util.ts
const FALLBACK_FILENAME = 'unnamed-file';

const CJK_PATTERN =
  /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;
const REPLACEMENT_PATTERN = /\uFFFD/g;
const MOJIBAKE_PATTERN =
  /(?:Ã|Â|Ä|Å|Æ|Ç|Ð|Ñ|ä|å|æ|ç|è|é|ï¼|ï½|•|ˆ|„|œ|›|‰|\uFFFD)/g;
const NBSP_AS_SPACE_PATTERN =
  /([ãäåæçèéï]) (?=[\u00a1-\u00bf€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ])/g;
const PATH_SEPARATOR_PATTERN = /[\\/]+/g;
const DOT_SEQUENCE_PATTERN = /\.{2,}/g;
const STANDALONE_DOT_PATTERN = /(^|[\s-])\.(?=$|[\s-])/g;
const WHITESPACE_PATTERN = /\s+/g;
const WINDOWS_1252_BYTES = new Map<string, number>([
  ['€', 0x80],
  ['‚', 0x82],
  ['ƒ', 0x83],
  ['„', 0x84],
  ['…', 0x85],
  ['†', 0x86],
  ['‡', 0x87],
  ['ˆ', 0x88],
  ['‰', 0x89],
  ['Š', 0x8a],
  ['‹', 0x8b],
  ['Œ', 0x8c],
  ['Ž', 0x8e],
  ['‘', 0x91],
  ['’', 0x92],
  ['“', 0x93],
  ['”', 0x94],
  ['•', 0x95],
  ['–', 0x96],
  ['—', 0x97],
  ['˜', 0x98],
  ['™', 0x99],
  ['š', 0x9a],
  ['›', 0x9b],
  ['œ', 0x9c],
  ['ž', 0x9e],
  ['Ÿ', 0x9f],
]);

export function normalizeUploadedFilename(originalname: string): string {
  if (typeof originalname !== 'string') {
    return FALLBACK_FILENAME;
  }

  const trimmed = originalname.trim();

  if (!trimmed) {
    return FALLBACK_FILENAME;
  }

  const candidate = hasMojibakeSignal(trimmed)
    ? decodeMojibakeCandidate(trimmed)
    : '';
  const normalized = shouldUseDecodedCandidate(trimmed, candidate)
    ? candidate
    : trimmed;

  return sanitizeVisibleFilename(normalized);
}

function hasMojibakeSignal(value: string): boolean {
  return countMojibakeSignals(value) > 0 || countReplacementChars(value) >= 2;
}

function shouldUseDecodedCandidate(
  original: string,
  candidate: string,
): boolean {
  if (!candidate) {
    return false;
  }

  const originalReplacementCount = countReplacementChars(original);
  const candidateReplacementCount = countReplacementChars(candidate);

  if (candidateReplacementCount > originalReplacementCount) {
    return false;
  }

  const originalMojibakeCount = countMojibakeSignals(original);
  const candidateMojibakeCount = countMojibakeSignals(candidate);

  return (
    CJK_PATTERN.test(candidate) ||
    candidateReplacementCount < originalReplacementCount ||
    candidateMojibakeCount < originalMojibakeCount
  );
}

function decodeMojibakeCandidate(value: string): string {
  const bytes: number[] = [];
  const normalizedValue = value.replace(NBSP_AS_SPACE_PATTERN, '$1\u00A0');

  for (const char of normalizedValue) {
    const windows1252Byte = WINDOWS_1252_BYTES.get(char);

    if (windows1252Byte !== undefined) {
      bytes.push(windows1252Byte);
      continue;
    }

    const codePoint = char.codePointAt(0);

    if (codePoint === undefined || codePoint > 0xff) {
      return '';
    }

    bytes.push(codePoint);
  }

  return Buffer.from(bytes).toString('utf8').trim();
}

function sanitizeVisibleFilename(value: string): string {
  const cleaned = removeControlChars(value)
    .replace(PATH_SEPARATOR_PATTERN, ' ')
    .replace(DOT_SEQUENCE_PATTERN, '.')
    .replace(STANDALONE_DOT_PATTERN, '$1')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();

  return cleaned || FALLBACK_FILENAME;
}

function removeControlChars(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const codePoint = char.codePointAt(0);

      return (
        codePoint === undefined || (codePoint >= 0x20 && codePoint !== 0x7f)
      );
    })
    .join('');
}

function countReplacementChars(value: string): number {
  return value.match(REPLACEMENT_PATTERN)?.length ?? 0;
}

function countMojibakeSignals(value: string): number {
  return value.match(MOJIBAKE_PATTERN)?.length ?? 0;
}
