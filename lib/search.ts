const toLatinDigit = (digit: string) => {
  const code = digit.charCodeAt(0);
  return String(code >= 0x06f0 && code <= 0x06f9 ? code - 0x06f0 : code - 0x0660);
};

/** Normalize Persian/Arabic variants, marks, zero-width characters and numerals. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ـ/g, '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, ' ')
    .replace(/[۰-۹٠-٩]/g, toLatinDigit)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Immutable-by-convention token index for content that is searched repeatedly. */
export type SearchTextIndex = ReadonlySet<string>;

/** Normalize and tokenize a search target once when its underlying record changes. */
export function indexSearchText(content: string): SearchTextIndex {
  const normalized = normalizeSearchText(content);
  return new Set(normalized ? normalized.split(' ') : []);
}

/** Prepare a query once so a filtered list does not normalize it for every row. */
export function createSearchQuery(query: string): SearchTextIndex {
  const normalized = normalizeSearchText(query);
  return new Set(normalized ? normalized.split(' ') : []);
}

/**
 * Deterministic local matching: every query token must be present, independent
 * of order or punctuation. This is not fuzzy typo correction.
 */
export function matchesSearchIndex(contentTokens: SearchTextIndex, queryTokens: SearchTextIndex): boolean {
  for (const token of queryTokens) {
    if (!contentTokens.has(token)) return false;
  }
  return true;
}

/** Convenience wrapper for one-off searches. */
export function matchesSearchText(content: string, query: string): boolean {
  return matchesSearchIndex(indexSearchText(content), createSearchQuery(query));
}
