// @ts-check
//
// The environment the gate hands its children.
//
// `git push` runs `.husky/pre-push` with `GIT_DIR` — and often `GIT_WORK_TREE`,
// `GIT_INDEX_FILE`, `GIT_PREFIX` — exported into the hook's environment, naming
// the repository being pushed from. Everything the hook spawns inherits them:
// `pre-push.mjs`, `run.mjs`, every check in the manifest, and every process
// those checks start.
//
// That is not a nuisance, it is an incident this machinery was written after
// (trucutru #163; the issue numbers throughout these modules are that repo's,
// which is where they were fixed). A `git` run anywhere below,
// against any directory, with any `-C`, operates on the repository `GIT_DIR`
// names rather than the one its arguments describe — `git -C <scratch> init`
// re-initialises it instead of creating a repository at `<scratch>`. The
// `sandcastle` leg runs a suite whose fixtures do exactly that, and the result
// was fixture commits on the developer's `main`, fixture branches in their
// refs, `core.bare` true, and a `Sandcastle Test` identity in their config.
//
// So the gate unsets them. A check should behave the same whether it was
// started by a hook or typed by hand, and a check that needs a repository can
// name one; none may inherit whichever one git happened to be pushing.

/** The variables git exports into a hook's environment.
 *
 *  In trucutru a test held this list in step with a second copy in
 *  `.sandcastle/__tests__/helpers.ts`. Neither that copy nor that test came
 *  across — nothing under `.sandcastle/` here reads GIT_DIR at all — so this is
 *  the only copy, and it is unguarded. If a sandbox fixture ever grows one,
 *  bring the test with it: two lists that disagree leave a hole the size of the
 *  shorter one. */
export const AMBIENT_GIT_VARIABLES = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_PREFIX',
  'GIT_CONFIG',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
];

/**
 * `process.env` with every variable above removed.
 *
 * @returns {NodeJS.ProcessEnv}
 */
export function withoutAmbientGit() {
  const env = { ...process.env };

  for (const name of AMBIENT_GIT_VARIABLES) delete env[name];

  return env;
}
