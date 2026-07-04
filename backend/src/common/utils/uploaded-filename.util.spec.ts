// backend/src/common/utils/uploaded-filename.util.spec.ts
import { normalizeUploadedFilename } from './uploaded-filename.util';

describe('normalizeUploadedFilename', () => {
  it('keeps valid UTF-8 Chinese filenames unchanged', () => {
    const filename = '中文文件.pdf';

    expect(normalizeUploadedFilename(filename)).toBe(filename);
  });

  it('keeps English filenames unchanged', () => {
    expect(normalizeUploadedFilename('summary.pdf')).toBe('summary.pdf');
    expect(normalizeUploadedFilename('sample-data-2026.xlsx')).toBe(
      'sample-data-2026.xlsx',
    );
  });

  it('decodes typical latin1 mojibake filenames before persistence', () => {
    const mojibakeFilename = Buffer.from('中文文件.pdf', 'utf8').toString(
      'latin1',
    );
    const sampleMojibakeFilename = Buffer.from(
      '2026年度中文样本（411项）.xlsx',
      'utf8',
    ).toString('latin1');

    expect(normalizeUploadedFilename(mojibakeFilename)).toBe('中文文件.pdf');
    expect(normalizeUploadedFilename(sampleMojibakeFilename)).toBe(
      '2026年度中文样本（411项）.xlsx',
    );
    expect(normalizeUploadedFilename('ä¸­æ–‡.xlsx')).toBe('中文.xlsx');
  });

  it('uses a fallback filename for empty or non-string inputs', () => {
    expect(normalizeUploadedFilename('')).toBe('unnamed-file');
    expect(normalizeUploadedFilename('   ')).toBe('unnamed-file');
    expect(normalizeUploadedFilename(undefined as unknown as string)).toBe(
      'unnamed-file',
    );
  });

  it('does not rewrite filenames without a valid decoded candidate', () => {
    expect(normalizeUploadedFilename('März summary.xlsx')).toBe(
      'März summary.xlsx',
    );
    expect(normalizeUploadedFilename('file-ç-version.pdf')).toBe(
      'file-ç-version.pdf',
    );
  });

  it('trims spaces and removes unsafe path characters without dropping Chinese text', () => {
    const result = normalizeUploadedFilename(' ..\\中文/补充\u0000文件.pdf ');

    expect(result).toBe('中文 补充文件.pdf');
    expect(result).not.toContain('/');
    expect(result).not.toContain('\\');
    expect(result).not.toContain('..');
    expect(result).not.toContain('\u0000');
  });
});
