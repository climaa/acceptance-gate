import * as fs from 'node:fs';
import * as path from 'node:path';
import { SKIP_TAG, TIERS, tierOf } from '@gate/visual-diff/policy';
import { z } from 'zod';
/**
 * The two shapes this module answers with are declared in lib/api-contract.ts,
 * as `StoryTierSchema`: `GET /api/stories` serves them verbatim and the run
 * panel parses that answer against the same schema, so declaring them here as
 * well would be the drift this app has no other mechanism against.
 */
import type { StoryComponent, StoryTier } from './api-contract';
import { repoRoot } from './git';

/**
 * What there is to capture, as the reviewer's own vocabulary.
 *
 * `--filter` is a substring matched against a story's id or title, which makes
 * every legal value a value nobody can guess: the corpus lives in a Storybook
 * build, and a text box asks a reviewer to remember it. This reads the build and
 * answers with the list — tiers, and the components under each — so the panel can
 * offer it instead.
 *
 * Read from the CHECKOUT, never from the data directory: the build is the
 * differ's input and the console's `capture` builds it on the way past. An
 * instance with no checkout behind it answers with nothing, which is the honest
 * answer for a deployment.
 */

/** Where `check` serves the corpus from, per `policy.PATHS.storybookStatic`. */
const INDEX = path.join('apps', 'storybook', 'storybook-static', 'index.json');

/** Only the four fields this module reads, so a Storybook that adds a fifth is
 *  not a parse failure. `type` separates stories from the docs pages beside
 *  them; `tags` is where a story says it is not captured. */
const EntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  /** What the tier is derived FROM. `tierOf` reads `packages/ui/src/<tier>/`, and
   *  it is the same call `planCaptures` makes — so a story this module groups
   *  under a tier is a story the differ will capture under it. Deriving the tier
   *  from the id prefix instead would be a second, disagreeing answer. */
  importPath: z.string(),
  tags: z.array(z.string()).optional(),
});

const IndexSchema = z.object({ entries: z.record(z.string(), EntrySchema) });

/** A story id is `<tier>-<component>--<story>`; everything before the `--` is
 *  what every story of that component shares, and so is what a filter names. */
const componentOf = (id: string): string => id.split('--')[0] ?? id;

/** Code-unit order, the repo's determinism rule: no `localeCompare` anywhere, so
 *  two machines list the same corpus in the same order. */
const byName = (left: StoryComponent, right: StoryComponent) =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : 0;

/**
 * The corpus the build holds, grouped by tier — or an empty list when there is
 * no build to read.
 *
 * A missing build is not an error: it is a checkout nobody has captured from yet,
 * and the panel says so rather than refusing. A build that is there and cannot be
 * parsed IS an error, and throws naming the file — a half-written index is what a
 * killed build leaves behind, and reading it as "no stories" would offer a
 * reviewer an empty list as if the corpus were empty.
 */
export function readStories(root: string | null = repoRoot()): StoryTier[] {
  if (!root) return [];

  let raw: string;
  try {
    raw = fs.readFileSync(path.join(root, INDEX), 'utf8');
  } catch {
    return [];
  }

  const { entries } = IndexSchema.parse(JSON.parse(raw) as unknown);
  const byTier = new Map<string, Map<string, string>>();

  for (const entry of Object.values(entries)) {
    if (entry.type !== 'story') continue;
    if (entry.tags?.includes(SKIP_TAG)) continue;

    // A story outside `packages/ui/src/<tier>/` is one the matrix has no cell
    // for. `planCaptures` throws on it; this module is a list of things to tick,
    // so it leaves it out and lets the run be the place that complains.
    const tier = tierOf(entry.importPath);
    if (!tier) continue;

    const filter = componentOf(entry.id);

    const components = byTier.get(tier) ?? new Map<string, string>();
    components.set(filter, entry.title.split('/').at(-1) ?? filter);
    byTier.set(tier, components);
  }

  // Tier order comes from policy rather than from the build: it is the order the
  // report draws its sections in, and a reviewer reads one after the other.
  return TIERS.filter((tier) => byTier.has(tier)).map((tier) => ({
    tier,
    components: [...(byTier.get(tier) ?? [])]
      .map(([filter, name]) => ({ filter, name }))
      .sort(byName),
  }));
}
