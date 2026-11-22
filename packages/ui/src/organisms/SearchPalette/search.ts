/** The five things census's index holds, one group each in the palette. */
export type SearchKind = 'workspace' | 'component' | 'file' | 'gap' | 'scenario';

/**
 * One entry of the index the caller built. Plain data: the palette never knows
 * where an entry leads, it hands the entry back through `onSelect`.
 */
export interface SearchEntry {
  /** Unique across the whole index, every kind included. */
  id: string;
  kind: SearchKind;
  /** The line the reader matches on: a name, or a path for a file. */
  title: string;
  /** Right-aligned detail — a component's tier, a gap's kind. Also searched. */
  meta?: string;
}

export interface SearchGroup {
  kind: SearchKind;
  entries: SearchEntry[];
}

/**
 * The order the groups are drawn in. Components above files is the tile's
 * (`organisms-searchpalette--results`): a name match reads before the paths that
 * contain it.
 */
export const GROUP_ORDER: readonly SearchKind[] = [
  'workspace',
  'component',
  'file',
  'gap',
  'scenario',
];

const termsOf = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

const matchesTerms = (entry: SearchEntry, terms: readonly string[]) => {
  const haystack = `${entry.title} ${entry.meta ?? ''}`.toLowerCase();
  return terms.length > 0 && terms.every((term) => haystack.includes(term));
};

/**
 * Every whitespace-separated term of the query, case-insensitively, somewhere in
 * the title or the meta line. A blank query matches nothing: the palette lists
 * results, never the whole index.
 */
export const matches = (entry: SearchEntry, query: string) =>
  matchesTerms(entry, termsOf(query));

/** The matches, grouped by kind in {@link GROUP_ORDER}, index order inside each. */
export function groupResults(
  entries: readonly SearchEntry[],
  query: string,
): SearchGroup[] {
  const terms = termsOf(query);
  const found = entries.filter((entry) => matchesTerms(entry, terms));

  return GROUP_ORDER.map((kind) => ({
    kind,
    entries: found.filter((entry) => entry.kind === kind),
  })).filter((group) => group.entries.length > 0);
}
