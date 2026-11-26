/**
 * `suite-integrity-core.mjs`, declared for the suite that reads it.
 *
 * This workspace does not set `allowJs`, so a `.mjs` file is outside its
 * TypeScript program and a test importing one would be implicitly `any`. A
 * sibling declaration is read as that module's types by name, while the import
 * still resolves to the real `.mjs` at runtime.
 */

export const CONTROL_TAGS: readonly string[];

export interface TagAt {
  tag: string;
  line: number;
}

export interface ParsedFeature {
  featureTags: TagAt[];
  scenarios: { title: string; tags: TagAt[] }[];
}

export function parseFeature(text: string): ParsedFeature;

export function checkLaneCoverage(root: string, lanes: readonly string[]): string[];

export interface Lane {
  workspace: string;
  config?: string;
  featuresDir: string;
  expected: number;
  expectedName: string;
  name: string;
  serialFeatures?: string[];
  checkTags?: (file: string, feature: ParsedFeature) => string[];
  extraChecks?: () => string[];
}

export function runIntegrityCheck(lane: Lane): void;
