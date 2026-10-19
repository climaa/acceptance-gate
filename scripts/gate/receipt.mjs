// @ts-check
//
// The receipt: what `pnpm gate` writes when it passes, and how to ask later
// whether a tree was ever verified.
//
// WHY THIS FILE EXISTS. Every document in this repository says the same thing —
// nothing runs on the server, so what guards a commit is the gate on the machine
// that made it and the note that leaves in `refs/notes/gate`. Measured at the end
// of the session that wrote those documents:
//
//   git ls-remote origin 'refs/notes/*'   → nothing
//   git notes --ref=gate list             → 29
//   … reachable from main                 → 1
//
// The notes were never pushed, and a squash-merge rewrote every commit they were
// attached to, so twenty-eight of twenty-nine pointed at branch tips no ref
// reaches any more. The guarantee was weaker than the prose.
//
// Both halves of the fix are here, and the second one is the interesting one:
// the receipt already records the TREE, and a squash-merge preserves the tree.
// So a receipt written on a branch tip still vouches for the commit that landed,
// as long as something asks by tree rather than by commit. Measured on the same
// repository: 27 of 30 commits on `main` had a tree some receipt vouched for,
// while exactly 1 had a note of its own.
import { execFileSync, spawnSync } from 'node:child_process';

/** Where the receipt is kept. */
export const NOTES_REF = 'gate';

/** @param {string} command @param {readonly string[]} args @returns {string} */
const git = (command, args) =>
  execFileSync('git', [command, ...args], { encoding: 'utf8' }).trim();

/** The tree a ref points at — the thing the gate actually checked. A rebase that
 *  changes only a message or a parent leaves it alone, which is the whole reason
 *  the receipt records it.
 *  @param {string} ref @returns {string} */
export const treeOf = (ref) => git('rev-parse', [`${ref}^{tree}`]);

/**
 * The receipt's body.
 *
 * It is a receipt, not a lock: anyone can write one by hand, and it proves only
 * what the machine that wrote it ran. That is what self-certification is, and
 * saying so here is better than implying more.
 *
 * IT RECORDS WHICH TIER RAN, and for a while it did not — which made "verified"
 * mean less than every document here claimed. The hook runs the fast tier, so
 * every receipt in this repository's history was written by a run that never
 * started the differ, and `--verify` reported those identically to a full run.
 * A tree can now say which of the two vouched for it, and `--verify --tier full`
 * can refuse the weaker answer.
 *
 * A receipt with no `tier` is from before this and is read as `fast`: it is the
 * tier those runs actually used, so the old notes keep meaning exactly what they
 * always meant rather than being promoted by silence.
 *
 * @param {string} sha
 * @param {'fast' | 'full'} tier
 * @returns {string}
 */
export const noteFor = (sha, tier) =>
  JSON.stringify({
    tree: treeOf(sha),
    at: new Date().toISOString(),
    node: process.version,
    tier,
  });

/** What a receipt with no `tier` field meant when it was written. */
export const DEFAULT_TIER = 'fast';

/** Strongest first: a tree verified at both tiers is vouched for by the full one.
 *  @type {readonly ('full' | 'fast')[]} */
export const TIERS_BY_STRENGTH = ['full', 'fast'];

/** One note's payload, or `null` if it is missing or not ours.
 *  @param {string} sha
 *  @returns {{ tree?: string, at?: string, tier?: 'fast' | 'full' } | null} */
export function readReceipt(sha) {
  const shown = spawnSync('git', ['notes', `--ref=${NOTES_REF}`, 'show', sha], {
    encoding: 'utf8',
  });

  if (shown.status !== 0) return null;

  try {
    return JSON.parse(shown.stdout);
  } catch {
    return null;
  }
}

/** Every commit that carries a receipt. `git notes list` prints
 *  `<note-sha> <annotated-sha>` per line.
 *  @returns {readonly string[]} */
function annotated() {
  const listed = spawnSync('git', ['notes', `--ref=${NOTES_REF}`, 'list'], {
    encoding: 'utf8',
  });

  if (listed.status !== 0) return [];

  return listed.stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[1])
    .filter((sha) => typeof sha === 'string' && sha !== '');
}

/**
 * A receipt for this ref's TREE, from anywhere in the notes — not only from a
 * note attached to this commit.
 *
 * That distinction is the point. `git notes show <sha>` answers for one commit,
 * and a squash-merge produces a commit no receipt was ever attached to. The tree
 * survives, so this finds the receipt written on the branch tip that became it.
 *
 * THE STRONGEST ONE WINS. A tree can carry two receipts — the hook writes a fast
 * one on push, and a later `pnpm gate --tier full` writes a full one for the same
 * tree. Returning whichever was listed first would make the answer depend on note
 * ordering, so the full one is preferred when both exist.
 *
 * @param {string} ref
 * @returns {{ sha: string, at?: string, tier: 'fast' | 'full' } | null}
 */
export function findReceipt(ref) {
  const tree = treeOf(ref);

  /** @type {{ sha: string, at?: string, tier: 'fast' | 'full' }[]} */
  const found = [];

  for (const sha of annotated()) {
    const receipt = readReceipt(sha);

    if (receipt?.tree === tree) {
      found.push({ sha, at: receipt.at, tier: receipt.tier ?? DEFAULT_TIER });
    }
  }

  for (const tier of TIERS_BY_STRENGTH) {
    const strongest = found.find((receipt) => receipt.tier === tier);
    if (strongest !== undefined) return strongest;
  }

  return null;
}

/**
 * Send the notes to the remote, best effort.
 *
 * `--no-verify` because the hook this is called from would otherwise re-enter
 * itself. Failure is printed and ignored: a receipt that did not reach the
 * remote is the state this repository was already in, and refusing the push over
 * it would turn a bookkeeping problem into a blocked branch.
 *
 * @param {string | undefined} remote
 * @returns {boolean}
 */
export function publish(remote) {
  if (remote === undefined || remote === '') return false;

  const pushed = spawnSync(
    'git',
    ['push', '--no-verify', '--quiet', remote, `refs/notes/${NOTES_REF}`],
    { encoding: 'utf8' },
  );

  if (pushed.status === 0) return true;

  process.stdout.write(
    `gate: receipt written locally but not pushed to ${remote} — ` +
      `run \`git push ${remote} refs/notes/${NOTES_REF}\` to publish it\n`,
  );

  return false;
}
