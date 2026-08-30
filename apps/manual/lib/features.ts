import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';

import type { ManualPage } from '@/lib/allowlist';
import { FEATURE_SOURCES } from '@/lib/sources';

/**
 * The AST types live in `@cucumber/messages`, not in `@cucumber/gherkin` — its
 * barrel exports the parser and nothing to describe what the parser returns. So
 * they are derived from the parser's own signature instead of imported.
 *
 * That is not stylistic. Naming `messages.GherkinDocument` would make it a
 * second direct dependency of this workspace, and the whole argument for parsing
 * Gherkin here rather than adopting a docs framework is that it costs exactly
 * one. Structural derivation resolves through gherkin's own `node_modules`
 * under pnpm's strict layout; a named import would not.
 */
type GherkinDocument = ReturnType<InstanceType<typeof Parser>['parse']>;
type GherkinFeature = NonNullable<GherkinDocument['feature']>;
type FeatureChild = GherkinFeature['children'][number];
type GherkinScenario = NonNullable<FeatureChild['scenario']>;
type GherkinStep = GherkinScenario['steps'][number];

/** The keyword as authored. `And` is never resolved to what it continues. */
export type StepKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But' | '*';

const STEP_KEYWORDS: readonly string[] = ['Given', 'When', 'Then', 'And', 'But', '*'];

export interface ManualStep {
  keyword: StepKeyword;
  /** Step text with the keyword and surrounding whitespace stripped. */
  text: string;
}

export interface ManualScenario {
  name: string;
  /**
   * Authored order, flat — never grouped into Given/When/Then blocks. The
   * console's "The selected job tab is a link" runs When → Then → When → Then,
   * so bucketing by keyword would reorder a reader's steps and misstate the
   * requirement.
   */
  steps: ManualStep[];
  /** Tags as authored, leading `@` included. Empty when untagged. */
  tags: string[];
}

export interface ManualFeature {
  /** The `Feature:` line. */
  name: string;
  /** `Background:` steps, or `[]` when the file declares none. */
  background: ManualStep[];
  scenarios: ManualScenario[];
}

/**
 * The ids gherkin's builder stamps onto nodes are never read here — this parses
 * for prose, not for a test runner — so the generator is a constant rather than
 * a reason to depend on `@cucumber/messages` for its uuid helper.
 */
const NO_ID = () => '';

function unsupported(construct: string, featurePath: string, line: number): Error {
  return new Error(
    `${featurePath}:${line} uses ${construct}, which the manual does not render. ` +
      `Publishing it would quietly drop part of a product requirement — teach ` +
      `lib/features.ts to render it, or take the feature off the allowlist.`,
  );
}

function isStepKeyword(keyword: string): keyword is StepKeyword {
  return STEP_KEYWORDS.includes(keyword);
}

function toStep(step: GherkinStep, featurePath: string): ManualStep {
  if (step.docString) throw unsupported('a DocString', featurePath, step.location.line);
  if (step.dataTable) throw unsupported('a DataTable', featurePath, step.location.line);

  const keyword = step.keyword.trim();
  if (!isStepKeyword(keyword)) {
    throw unsupported(`the keyword "${keyword}"`, featurePath, step.location.line);
  }

  return { keyword, text: step.text };
}

function toScenario(scenario: GherkinScenario, featurePath: string): ManualScenario {
  if (scenario.examples.length > 0) {
    throw unsupported('a Scenario Outline', featurePath, scenario.location.line);
  }

  return {
    name: scenario.name,
    tags: scenario.tags.map((tag) => tag.name),
    steps: scenario.steps.map((step) => toStep(step, featurePath)),
  };
}

function parseDocument(source: string): GherkinDocument {
  const parser = new Parser(new AstBuilder(NO_ID), new GherkinClassicTokenMatcher());
  return parser.parse(source);
}

/**
 * Turns Gherkin source into what the manual publishes from it.
 *
 * Throws on every construct this app does not render. None of them appear in the
 * three published features today, and failing loudly is the point: a requirement
 * that starts using one would otherwise publish a page silently missing half of
 * it, which is exactly the drift the manual claims it cannot have.
 *
 * `label` only ever appears in those errors — it is what tells you which file to
 * open.
 */
export function parseFeatureSource(source: string, label: string): ManualFeature {
  const feature = parseDocument(source).feature;

  if (!feature) throw new Error(`${label} declares no Feature.`);

  const background: ManualStep[] = [];
  const scenarios: ManualScenario[] = [];

  for (const child of feature.children) {
    if (child.rule) throw unsupported('a Rule', label, child.rule.location.line);
    if (child.background) {
      background.push(...child.background.steps.map((step) => toStep(step, label)));
    }
    if (child.scenario) scenarios.push(toScenario(child.scenario, label));
  }

  return { name: feature.name, background, scenarios };
}

/**
 * What a page publishes, for one allowlisted feature.
 *
 * The source is read in `lib/sources.ts` rather than here — see that file for
 * why the paths there are literals. Note that reading outside this workspace is
 * invisible to turbo, whose default inputs stop at the package directory: a
 * `.feature` edit would not invalidate this app's `build` or `test` hash, and
 * the pinned-scenario check would pass from cache on the pull request that broke
 * it. `turbo.json` therefore names `apps/e2e/features/acceptance/*.feature` in
 * `@gate/manual#build` and `@gate/manual#test`. That file is strict JSON and
 * cannot say why, so it is said here: the two move together.
 */
export function parseManualPage(page: ManualPage): ManualFeature {
  return parseFeatureSource(FEATURE_SOURCES[page.slug], page.featurePath);
}
