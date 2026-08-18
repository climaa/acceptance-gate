/**
 * A Storybook story id, read back as the name a human gave the component.
 *
 * `templates-posttemplate--long-prose` is what the differ records for every
 * shot; `PostTemplate — Long Prose` is what a reviewer is deciding about. The
 * derivation is a rule, not a table, because the corpus grows by story and a
 * lookup would go stale the day someone adds one — with one exception, the map
 * below, which is the part no rule can recover.
 */

/** Stripped from the front of a slug, longest first so `templates-` never loses
 *  to a shorter sibling. `pages-` is here because Storybook allows the tier and
 *  the summary schema does not: a slug that carries it still reads correctly. */
const TIER_PREFIXES = ['molecules-', 'organisms-', 'templates-', 'atoms-', 'pages-'];

/**
 * Compound component names, whose internal capitals a lowercased id cannot
 * carry. Keyed by the lowercased word as it appears in a slug.
 *
 * Only compounds need an entry — `badge` title-cases to `Badge` on its own. A
 * name that is missing here reads as one capitalised word rather than as
 * nothing, so a new component is a cosmetic gap and never a broken card.
 */
const CANONICAL_NAMES: Record<string, string> = {
  blogindextemplate: 'BlogIndexTemplate',
  bucketchip: 'BucketChip',
  codeblock: 'CodeBlock',
  emptystate: 'EmptyState',
  postcard: 'PostCard',
  postmeta: 'PostMeta',
  posttemplate: 'PostTemplate',
  segmentedcontrol: 'SegmentedControl',
  sitefooter: 'SiteFooter',
  siteheader: 'SiteHeader',
  skiplink: 'SkipLink',
  taglist: 'TagList',
  themetoggle: 'ThemeToggle',
  thumbnail: 'Thumbnail',
  tristatecheckbox: 'TriStateCheckbox',
};

/** Component half and variant half, as Storybook writes them. */
const HALVES = '--';

/** Space, em dash, space — the separator between the two halves. */
const JOINER = ' — ';

function stripTier(slug: string): string {
  const prefix = TIER_PREFIXES.find((candidate) => slug.startsWith(candidate));

  return prefix ? slug.slice(prefix.length) : slug;
}

const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** One half of a slug: hyphen-separated words, each capitalised, with a
 *  compound name restored to the casing its own file carries. */
function words(half: string): string {
  return half
    .split('-')
    .map((word) => CANONICAL_NAMES[word] ?? titleCase(word))
    .join(' ');
}

/** The title a report shows for `slug`. */
export function storyTitle(slug: string): string {
  return stripTier(slug).split(HALVES).map(words).join(JOINER);
}
