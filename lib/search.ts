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

/**
 * Deterministic local matching: every query token must be present, independent
 * of order or punctuation. This is not fuzzy typo correction.
 */
export function matchesSearchText(content: string, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const contentTokens = new Set(normalizeSearchText(content).split(' '));
  return [...new Set(normalizedQuery.split(' '))].every((token) => contentTokens.has(token));
}
