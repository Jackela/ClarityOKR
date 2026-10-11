import type { ExportFormat } from '@clarityokr/contracts';

const FILE_NAME_PREFIX = 'ClarityOKR';
const FALLBACK_TITLE = '未命名';
/** Total file name budget in UTF-8 bytes (most file systems allow 255). */
const MAX_FILE_NAME_BYTES = 200;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Characters that are illegal in a file name on at least one platform. */
const ILLEGAL_CHARS = /[\\/:*?"<>|]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
/** Bidirectional controls can make a name display differently from what it is. */
const BIDI_CONTROLS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

function utf8Length(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/**
 * Turns an OKR title into a safe file name fragment: path separators and characters that
 * are illegal on Windows become `_`, control and bidi characters are dropped, whitespace is
 * collapsed, leading/trailing dots and spaces are removed (Windows), reserved device names
 * get a suffix, and the result is cut on a character boundary to `maxBytes` UTF-8 bytes.
 */
export function sanitizeTitleForFileName(title: string, maxBytes = 120): string {
  let cleaned = title
    .replace(CONTROL_CHARS, ' ')
    .replace(BIDI_CONTROLS, '')
    .replace(ILLEGAL_CHARS, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '');

  let result = '';
  for (const { segment } of segmenter.segment(cleaned)) {
    if (utf8Length(result + segment) > maxBytes) break;
    result += segment;
  }
  cleaned = result.replace(/[. ]+$/g, '');

  if (cleaned.length === 0) return FALLBACK_TITLE;
  const base = cleaned.split('.')[0] ?? cleaned;
  if (WINDOWS_RESERVED.test(base.trim())) return `${cleaned}_`;
  return cleaned;
}

function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `ClarityOKR-<sanitized title>-<yyyy-MM-dd>.<md|json>` (local date). */
export function buildExportFileName(title: string, date: Date, format: ExportFormat): string {
  const suffix = `-${formatLocalDate(date)}.${format}`;
  const budget = MAX_FILE_NAME_BYTES - utf8Length(FILE_NAME_PREFIX) - 1 - utf8Length(suffix);
  return `${FILE_NAME_PREFIX}-${sanitizeTitleForFileName(title, budget)}${suffix}`;
}
