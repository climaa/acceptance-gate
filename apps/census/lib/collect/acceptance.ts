/**
 * The Acceptance dimension: how many scenarios visit each deployed app.
 *
 * Scenarios are counted from the `.feature` source with the Gherkin parser, the
 * way the suite runs them: a Scenario is one, a Scenario Outline is one per
 * example row, a Background is none. Which app a feature visits comes from the
 * hand-kept map in `features.ts`; a feature it does not name is refused upstream,
 * before anything is counted.
 */
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';

import { APP_WORKSPACES, FEATURE_APPS, LOCAL_FEATURES } from '../features.ts';
import type { Workspace } from '../measurement.ts';

type GherkinDocument = ReturnType<InstanceType<typeof Parser>['parse']>;
type Child = NonNullable<GherkinDocument['feature']>['children'][number];

/** The parser asks for ids; nothing here reads one. */
const NO_ID = () => '';

function scenariosIn(children: readonly Child[]): number {
  return children.reduce((sum, child) => {
    if (child.rule) return sum + scenariosIn(child.rule.children);
    const scenario = child.scenario;
    if (!scenario) return sum;
    if (scenario.examples.length === 0) return sum + 1;
    return (
      sum + scenario.examples.reduce((rows, table) => rows + table.tableBody.length, 0)
    );
  }, 0);
}

/** The scenarios one `.feature` file runs. */
export function countScenarios(source: string): number {
  const parser = new Parser(new AstBuilder(NO_ID), new GherkinClassicTokenMatcher());
  const feature = parser.parse(source).feature;
  return feature ? scenariosIn(feature.children) : 0;
}

type AcceptanceValue = Workspace['dimensions']['acceptance'];

/**
 * Every deployed app's Acceptance value, keyed by workspace path, from the
 * scenario count of each feature (keyed by feature name). Local features run on a
 * machine with a data directory, never in the suite, so they never make an app
 * visited.
 */
export function acceptanceValues(
  counts: Readonly<Record<string, number>>,
): Record<string, AcceptanceValue> {
  const values: Record<string, AcceptanceValue> = {};
  for (const [app, path] of Object.entries(APP_WORKSPACES)) {
    const visiting = Object.entries(counts)
      .filter(([name]) => FEATURE_APPS[name] === app && !LOCAL_FEATURES.has(name))
      .sort(([a], [b]) => (a < b ? -1 : 1));
    values[path] = {
      dimension: 'acceptance',
      state: 'measured',
      scenarios: visiting.reduce((sum, [, n]) => sum + n, 0),
      features: visiting.map(([name]) => name),
    };
  }
  return values;
}
