import type { WebResearchItem } from './web-research';

export type EvidenceProvenance = {
  publisherFamilyCount: number;
  syndicatedItemCount: number;
  groupByEvidenceId: Record<string, string>;
  limitations: string[];
};

function normalizeTitle(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rootDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const aliases: Record<string, string> = {
    'bbc.com': 'bbc', 'bbc.co.uk': 'bbc',
    'reuters.com': 'thomson-reuters', 'thomsonreuters.com': 'thomson-reuters',
    'apnews.com': 'associated-press', 'ap.org': 'associated-press',
  };
  if (aliases[host]) return aliases[host];
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return host;
  const suffixes = new Set([
    'co.uk','org.uk','ac.uk','gov.uk','com.au','net.au','org.au','edu.au',
    'co.jp','com.br','com.in','co.in','com.tr','com.mx','com.sg','com.hk',
    'co.nz','com.tw','com.cn','com.ar','com.pl','com.ua','com.sa',
  ]);
  const lastTwo = labels.slice(-2).join('.');
  return suffixes.has(lastTwo) && labels.length >= 3
    ? labels.slice(-3).join('.')
    : lastTwo;
}

export function publisherFamilyKey(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    if (url.username || url.password) return undefined;
    return rootDomain(url.hostname);
  } catch {
    return undefined;
  }
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeTitle(value).split(' ').filter((word) => word.length > 2));
}

function titleSimilarity(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size < 6 || b.size < 6) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Groups sources conservatively by registrable-domain family and strong title
 * duplication. This is a provenance heuristic, not proof of legal ownership.
 */
export function assessEvidenceProvenance(evidence: readonly WebResearchItem[]): EvidenceProvenance {
  const parent = evidence.map((_item, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]!);
    return parent[index]!;
  };
  const unite = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };
  const familyByIndex = evidence.map((item) => publisherFamilyKey(item.url) ?? 'unknown:' + item.id);
  const firstByFamily = new Map<string, number>();
  for (let index = 0; index < evidence.length; index += 1) {
    const family = familyByIndex[index]!;
    const first = firstByFamily.get(family);
    if (first === undefined) firstByFamily.set(family, index);
    else unite(first, index);
  }
  for (let left = 0; left < evidence.length; left += 1) {
    for (let right = left + 1; right < evidence.length; right += 1) {
      if (familyByIndex[left] === familyByIndex[right]) continue;
      const similarity = titleSimilarity(evidence[left]!.title, evidence[right]!.title);
      if (similarity >= 0.88) unite(left, right);
    }
  }
  const groupByEvidenceId: Record<string, string> = {};
  const groups = new Set<string>();
  const familiesByGroup = new Map<string, Set<string>>();
  const itemCountByGroup = new Map<string, number>();
  for (let index = 0; index < evidence.length; index += 1) {
    const root = 'publisher-group:' + find(index);
    groupByEvidenceId[evidence[index]!.id] = root;
    groups.add(root);
    const families = familiesByGroup.get(root) ?? new Set<string>();
    families.add(familyByIndex[index]!);
    familiesByGroup.set(root, families);
    itemCountByGroup.set(root, (itemCountByGroup.get(root) ?? 0) + 1);
  }
  const syndicatedItemCount = [...familiesByGroup.entries()]
    .filter(([, families]) => families.size > 1)
    .reduce((sum, [group]) => sum + (itemCountByGroup.get(group) ?? 0), 0);
  return {
    publisherFamilyCount: groups.size,
    syndicatedItemCount,
    groupByEvidenceId,
    limitations: [
      'Publisher families are approximated from domain families and strong title duplication; they do not prove legal ownership or editorial independence.',
      'A source may republish material without an identical title; automated syndication detection can miss such cases.',
    ],
  };
}

export function countDistinctEvidenceGroups(
  ids: readonly string[],
  evidence: readonly WebResearchItem[],
): number {
  const provenance = assessEvidenceProvenance(evidence);
  return new Set(ids.map((id) => provenance.groupByEvidenceId[id]).filter((value): value is string => Boolean(value))).size;
}

export function normalizeResearchQuote(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A model quote is admissible only when a substantial exact-text excerpt exists locally. */
export function quoteOccursInSource(sourceText: string | undefined, quote: string): boolean {
  if (!sourceText || !quote) return false;
  const normalizedQuote = normalizeResearchQuote(quote);
  if (normalizedQuote.length < 28 || normalizedQuote.split(' ').filter(Boolean).length < 5) return false;
  return normalizeResearchQuote(sourceText).includes(normalizedQuote);
}
