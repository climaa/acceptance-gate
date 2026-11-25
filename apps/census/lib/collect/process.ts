/**
 * Files a test runs as a child process, which line coverage cannot see: vitest
 * measures its own process, so a script its tests spawn has zero covered lines
 * however thoroughly it is exercised. The owner ruled on 2026-11-25 that such a
 * file is _tested as a process_, not a file with no test.
 *
 * The evidence is Node's own: with `NODE_V8_COVERAGE` set on a suite run, each
 * child that exits cleanly writes one JSON file naming the URL of every module it
 * loaded. A process that loaded vitest (`node_modules/…/vitest/dist`) is vitest's
 * own, and says nothing about children. The gate's tests run a copy of their
 * scripts in a temporary repository, so a module matches a repo-relative file
 * when its decoded path ends with `/` + that path: whole segments, any prefix.
 */

const VITEST = /\/node_modules\/(?:.+\/)?vitest\/dist\//;

/** A coverage file's module URLs; none for one a killed process left half-written. */
function urlsOf(text: string): string[] {
  try {
    const parsed: unknown = JSON.parse(text);
    const result = (parsed as { result?: unknown } | null)?.result;
    if (!Array.isArray(result)) return [];
    return result
      .map((entry) => (entry as { url?: unknown } | null)?.url)
      .filter((url): url is string => typeof url === 'string');
  } catch {
    return [];
  }
}

/** A `file:` URL's decoded path, or undefined for `node:` and the like. */
function pathOf(url: string): string | undefined {
  if (!url.startsWith('file://')) return undefined;
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return undefined;
  }
}

/** The modules a child loaded, by decoded path; none when vitest itself was the process. */
function childModules(text: string): string[] {
  const paths = urlsOf(text)
    .map(pathOf)
    .filter((path): path is string => path !== undefined);
  if (paths.some((path) => VITEST.test(path))) return [];
  return paths.filter((path) => !path.includes('/node_modules/'));
}

/**
 * The repo-relative `files` some child process loaded, given the text of each
 * `NODE_V8_COVERAGE` file the suites left behind.
 */
export function testedAsProcess(
  coverageFiles: readonly string[],
  files: readonly string[],
): Set<string> {
  const byName = new Map<string, string[]>();
  for (const file of files) {
    const name = file.slice(file.lastIndexOf('/') + 1);
    byName.set(name, [...(byName.get(name) ?? []), file]);
  }
  const reached = new Set<string>();
  for (const path of coverageFiles.flatMap(childModules)) {
    const candidates = byName.get(path.slice(path.lastIndexOf('/') + 1)) ?? [];
    for (const file of candidates) if (path.endsWith(`/${file}`)) reached.add(file);
  }
  return reached;
}

/** The ones under `workspacePath`, relative to it, as the Code value names its files. */
export function inWorkspace(
  reached: ReadonlySet<string>,
  workspacePath: string,
): Set<string> {
  const prefix = `${workspacePath}/`;
  return new Set(
    [...reached].filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length)),
  );
}
