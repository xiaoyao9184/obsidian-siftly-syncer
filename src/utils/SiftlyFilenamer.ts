import { normalizePath } from 'obsidian';

const MONTH_PART_LENGTH = 2;
const DAY_PART_LENGTH = 2;
const MAX_NOTE_FILENAME_LENGTH = 50;
const MARKDOWN_EXTENSION_LENGTH = 3;
const DAY_PREFIX_SEPARATOR_LENGTH = 1;

export const SiftlyFilenamer = {
  buildBookmarkNotePath(baseFolder: string, tweetCreatedAt: string, text: string): string {
    const tweetDate = parseDate(tweetCreatedAt);
    const year = String(tweetDate.getUTCFullYear());
    const month = String(tweetDate.getUTCMonth() + 1).padStart(MONTH_PART_LENGTH, '0');
    const day = String(tweetDate.getUTCDate()).padStart(DAY_PART_LENGTH, '0');
    const textSuffix = sanitizeTextSuffix(text);
    const filename = `${textSuffix}.md`;

    return normalizePath(`${baseFolder}/${year}/${month}/${day}/${filename}`);
  }
};

function parseDate(isoDate: string): Date {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

function sanitizeTextSuffix(text: string): string {
  let sanitized = text
    .replace(/[\\/:*?"<>|]/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '');

  const maxSuffixLength =
    MAX_NOTE_FILENAME_LENGTH
    - DAY_PART_LENGTH
    - DAY_PREFIX_SEPARATOR_LENGTH
    - MARKDOWN_EXTENSION_LENGTH;
  if (sanitized.length > maxSuffixLength) {
    const truncated = sanitized.slice(0, maxSuffixLength);
    const lastDash = truncated.lastIndexOf('-');
    if (lastDash > maxSuffixLength / DAY_PART_LENGTH) {
      sanitized = truncated.slice(0, lastDash);
    } else {
      sanitized = truncated;
    }
  }

  return sanitized.length > 0 ? sanitized : 'untitled';
}
