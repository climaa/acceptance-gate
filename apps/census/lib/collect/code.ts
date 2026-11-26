/**
 * The Code dimension: line coverage per workspace and per file.
 *
 * A workspace is measured only when its vitest config has a `coverage` block; one
 * without is `unmeasured` by rule and never run, so its gap issue is what installs
 * the block. The numbers come from vitest's `json-summary`, written by CLI flags
 * into `.census/`, so no config gains an artifact. Its keys are absolute paths;
 * every one is made relative to the workspace here, and a key outside the
 * workspace (a shared config measuring two pseudo-workspaces) is dropped.
 */
type SummaryLines = { total: number; covered: number };
export type CoverageSummary = Readonly<Record<string, { lines: SummaryLines }>>;

const TIERS = new Set(['atoms', 'molecules', 'organisms', 'templates']);

/** Where the next token after `at` ends: a string, a comment, or one plain character. */
function tokenEnd(source: string, at: number): { end: number; comment: boolean } {
  const char = source[at];
  const pair = source.slice(at, at + 2);
  if (pair === '//') {
    const end = source.indexOf('\n', at);
    return { end: end === -1 ? source.length : end, comment: true };
  }
  if (pair === '/*') {
    const end = source.indexOf('*/', at + 2);
    return { end: end === -1 ? source.length : end + 2, comment: true };
  }
  if (char === "'" || char === '"' || char === '`') {
    let end = at + 1;
    while (end < source.length && source[end] !== char)
      end += source[end] === '\\' ? 2 : 1;
    return { end: end + 1, comment: false };
  }
  return { end: at + 1, comment: false };
}

/**
 * Source without its comments, so a comment naming a key never reads as one.
 * Scanned rather than matched: a glob in a string (`'**' + '/*.ts'`) or in a line
 * comment (`"@/*"`) holds `/*`, and a pattern would open a block comment there.
 */
function code(source: string): string {
  let kept = '';
  for (let at = 0; at < source.length;) {
    const { end, comment } = tokenEnd(source, at);
    if (!comment) kept += source.slice(at, end);
    at = end;
  }
  return kept;
}

/** Whether a vitest config declares coverage at all. */
export function hasCoverageBlock(config: string): boolean {
  return /\bcoverage\s*:\s*\{/.test(code(config));
}

/** The body of the `{…}` that opens at `open`, braces balanced. */
function braced(source: string, open: number): string {
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    if (source[at] === '{') depth += 1;
    if (source[at] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, at);
  }
  return source.slice(open + 1);
}

/** A `lines: n` value directly in `block`, if any. */
function linesIn(block: string): number | undefined {
  const lines = /\blines\s*:\s*(\d+(?:\.\d+)?)/.exec(block)?.[1];
  return lines === undefined ? undefined : Number(lines);
}

const GLOB_ENTRY = /(['"])([^'"]+)\1\s*:\s*\{([^}]*)\}/g;

/**
 * The floor the page draws: the `thresholds.lines` of the glob that names the
 * workspace (`'<workspace>/…': { lines }`), else the global `thresholds.lines`.
 * A config shared by several pseudo-workspaces sets one glob each and no global.
 */
export function linesFloor(config: string, workspace?: string): number | undefined {
  const source = code(config);
  const key = /\bthresholds\s*:\s*\{/.exec(source);
  if (!key) return undefined;
  const thresholds = braced(source, key.index + key[0].length - 1);
  const own = [...thresholds.matchAll(GLOB_ENTRY)].find(
    ([, , glob = '']) => workspace !== undefined && glob.startsWith(`${workspace}/`),
  );
  if (own) return linesIn(own[3] ?? '');
  return linesIn(thresholds.replace(GLOB_ENTRY, ''));
}

/** A `packages/ui` file's atomic tier, any other file's top folder, none for a root file. */
export function fileGroup(path: string): string | undefined {
  const [first, second] = path.split('/');
  if (first === 'src' && second !== undefined && TIERS.has(second)) return second;
  return path.includes('/') ? first : undefined;
}

/** One decimal, and 100 for nothing to cover, as the schema demands. */
function percent(covered: number, total: number): number {
  return total === 0 ? 100 : Math.round((covered / total) * 1000) / 10;
}

interface CodeInputs {
  floor?: number;
  /** Workspace-relative files fallow finds no test reaching. */
  untested: ReadonlySet<string>;
  /** Workspace-relative fallow file scores. */
  scores: ReadonlyMap<string, { maintainability?: number; crap?: number }>;
  /** Workspace-relative files a test ran as a child process (`process.ts`). */
  asProcess?: ReadonlySet<string>;
}

/** A measured workspace's Code value from its coverage summary. */
export function codeValue(
  summary: CoverageSummary,
  workspaceRoot: string,
  inputs: CodeInputs,
) {
  const prefix = `${workspaceRoot}/`;
  const files = Object.entries(summary)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, { lines }]) => {
      const path = key.slice(prefix.length);
      const group = fileGroup(path);
      const score = inputs.scores.get(path);
      return {
        path,
        ...(group === undefined ? {} : { group }),
        lines: {
          covered: lines.covered,
          total: lines.total,
          pct: percent(lines.covered, lines.total),
        },
        ...(score?.maintainability === undefined
          ? {}
          : { maintainability: score.maintainability }),
        ...(score?.crap === undefined ? {} : { crap: score.crap }),
        ...(lines.covered === 0 && inputs.asProcess?.has(path)
          ? { testedAsProcess: true as const }
          : {}),
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  const covered = files.reduce((sum, f) => sum + f.lines.covered, 0);
  const total = files.reduce((sum, f) => sum + f.lines.total, 0);
  const reached = files.filter((f) => !inputs.untested.has(f.path)).length;
  return {
    dimension: 'code' as const,
    state: 'measured' as const,
    lines: { covered, total, pct: percent(covered, total) },
    ...(inputs.floor === undefined ? {} : { floor: inputs.floor }),
    staticReachPct: percent(reached, files.length),
    files,
  };
}
