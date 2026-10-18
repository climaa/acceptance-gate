# Releasing

Nothing here publishes to npm. Every workspace is `private: true`, so the version is a
coherence marker rather than a distribution fact: the repo is the product, and it carries
one version across all eleven manifests.

There is no `CHANGELOG.md` and there are no changesets. **"Add a changelog entry" means
"write it into the release notes at tag time."** `/changelog` on the blog fetches the
GitHub Releases at build time (`apps/blog/lib/releases.ts`) and renders their bodies
verbatim, so the release body _is_ the published changelog. If someone asks for a
changeset here, say the mechanism does not exist rather than adding the tooling.

## The four parts

Every release body since 1.0.0 has the same four parts, in the same order. The argument
for them is
[_The changelog is the first page they open_](apps/blog/content/posts/the-changelog-is-the-first-page-they-open.mdx);
[v1.3.0](https://blog.carloslima.dev/changelog#v1.3.0) is the reference entry.

1. **A thesis line.** One sentence saying what the release is, before any version number
   or PR list. A reader with fifteen seconds gets the story from this line alone.
2. **What earned the version.** A `| Layer | PRs |` table: the cycle's pull requests
   grouped into the things they were actually for. A commit log records what happened;
   this table claims why it mattered, and the version number is only justified if the
   claim holds. _Minor_ means the table has a row that adds behaviour. _Patch_ means it
   does not.
3. **Index corrections.** Which `PROJECT_INDEX.md` numbers were wrong at the previous
   release and what they are now — measured, never adjusted. This is the part that makes
   the documentation something that can be wrong, audited where it is cheapest to audit.
4. **Known gaps.** What did not land, and why. A release that only lists wins is
   marketing; a release that names the miss is a record.

Close with `**Full changelog:** <compare URL>`.

Two constraints the renderer imposes, both worth knowing before writing: bodies are
compiled as **markdown, not MDX** (`format: 'md'`), and raw HTML is silently dropped —
so a type signature belongs in a code span. Bare `#NNN` references and a trailing compare
URL are autolinked for you by `apps/blog/lib/remark-release-body.ts`; body headings are
shifted down one level, so `##` is the top level to write at.

### The commit body and the release body are two different artifacts

The release commit's message explains the bump to someone reading `git log`. The release
body is a page on the website, read by people who will never open the repository. They
overlap in facts and share nothing in shape: the commit body is hard-wrapped prose, the
release body is markdown with headings and tables.

Pasting one into the other is what went wrong at v1.4.0 — it published a body with no
headings, no tables and no index corrections, and it was the only entry on `/changelog`
that rendered as an unbroken wall of text.

## The procedure

1. Branch `release/X.Y.Z` off `main`.

2. Bump **eleven** manifests in lockstep — the root, `apps/{blog,e2e,manual,storybook,visual-diff-ui}`
   and `packages/{links,logger,tsconfig,ui,visual-diff}`. Nothing else in the tree carries the
   version: the version strings in `apps/blog/app/changelog/page.tsx`'s comments and in
   `apps/blog/__tests__/giscus-threads.test.ts` are illustrative examples and fixtures, and
   are **not** bumped.

3. Prove `pnpm install --frozen-lockfile` still resolves and leaves `pnpm-lock.yaml`
   untouched. Every internal dependency is `workspace:*`, so it should — verify it rather
   than asserting it.

4. **Refresh `PROJECT_INDEX.md` and `README.md` in this same PR.** Regenerate the index
   with `/sc:index-repo`, then check every count-bearing claim against a real run:

   ```bash
   pnpm test                                    # per-workspace file/test counts
   pnpm test:sandcastle                         # the orchestrator's own suite
   node apps/e2e/scripts/suite-integrity.mjs    # EXPECTED_SCENARIOS
   node apps/e2e/scripts/local-integrity.mjs    # EXPECTED_LOCAL_SCENARIOS
   git ls-files packages/visual-diff/__baselines__ | grep -c '\.png$'   # baselines
   ```

   Write down the before/after of every number that moved — that list _is_ part 3 of the
   release body, and it cannot be reconstructed after the fact. Skipping this step is how
   v1.4.0 shipped without index corrections.

   `scripts/index-integrity.mjs`, run by `health:check`, holds two of those numbers to the
   tree — the version stamp against the root manifest, and the committed baseline count
   against the PNGs git tracks — so forgetting this step now fails a gate job rather than
   going quiet. It deliberately does not check the per-workspace test counts: deriving
   those means running every suite. Those are still yours to measure.

5. PR titled `release: X.Y.Z — <headline>`, with the release notes as the body. Gate green,
   then **squash**-merge; every release commit on `main` has a single parent and `(#NNN)`
   in its subject.

6. Annotated tag on the merge commit:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z — <headline>"
   git push origin vX.Y.Z
   ```

   The message is that one line. No body.

7. Ship. Fast-forward the `production` branch to the tag, then fire each project's deploy
   hook — moving the ref alone deploys nothing:

   ```bash
   gh api -X PATCH repos/climaa/acceptance-gate/git/refs/heads/production \
     -f sha="$(git rev-parse 'vX.Y.Z^{commit}')" -F force=false
   for p in blog manual storybook visual-diff-ui; do
     vercel api "/v9/projects/acceptance-gate-$p" | jq -r '.link.deployHooks[0].url' |
       xargs curl -s -o /dev/null -X POST
   done
   ```

   This is the step that changes the live sites — see
   [Production is a branch](#production-is-a-branch). The loop reads the hook URLs through
   the Vercel CLI's current team, so they are never written down. Wait for the production
   deployments it starts to finish before step 8.

8. Publish, with the four-part body in a file:

   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z — <headline>" --notes-file <path> --verify-tag
   ```

   The title must read `vX.Y.Z — <narrative>`, em-dash separated: `narrativeTitle()` in
   `apps/blog/lib/releases.ts` splits on it to render the tag and the story separately, and
   a title shaped any other way is printed whole.

   Publishing comes last on purpose: it is what puts the release on `/changelog` — see
   [Publishing is what updates /changelog](#publishing-is-what-updates-changelog).

Get the headline signed off **before** step 6. It becomes the tag message, the GitHub
Release title and the permanent `/changelog` entry.

## Production is a branch

Each of the four Vercel projects deploys production from the `production` branch, not from
`main`. A merge to `main` builds previews only; nothing reaches `*.carloslima.dev` until
`production` moves. Every production build is kept for a week, so building one per merge
took the Hobby plan's deployment storage to 75% in a fortnight — one per release does not.

Nothing else deploys. Git deployments are turned off on all four Vercel projects (Settings →
Git, `gitProviderOptions.createDeployments: disabled`), so a pull request, a merge to `main`
or a Sandcastle branch creates nothing on Vercel, and production builds only when step 7's
deploy hooks are fired. Each hook (`changelog-deploy` on the blog, `release` on the other
three) builds the `production` branch. Previews were login-protected and read by nothing —
not the `gate`, not the e2e suite — and every one spent the Hobby plan's daily deployment cap
that a release needs.

- **Why not `git.deploymentEnabled`:** each `vercel.json` still sets
  `{ "**": false, "production": true }`, and in the private children it works. Here, on a
  public repository, every push after #550 still created a deployment per project — cancelled
  by the `ignoreCommand`, but created, and creations are what the daily cap counts. The
  project setting is the only switch that held; it is all-or-nothing, hence the hooks.
- **Why the `ignoreCommand` builds when `VERCEL_GIT_PREVIOUS_SHA` is empty:** the one hook
  deployment fired to test this (2026-10-18) behaved as if it had none, and falling back to `HEAD^1` compared only the last commit,
  which would skip a project whose change sat earlier in the released range. A fired hook
  therefore always builds; a redeploy of the same sha builds too (the blog's `/changelog`
  refresh depends on that).

- **Why not `release`:** step 1 creates `release/X.Y.Z` branches, and git cannot hold a
  `release` branch beside them.
- **Why `gh api` and not `git push`:** it moves the ref on GitHub without a local checkout,
  and `force=false` refuses anything but a fast-forward, so production can never be rolled
  back to an older commit by accident.
- **Shipping without a release** — a blog post, an urgent fix — is the same two commands
  with `main`'s sha instead of a tag. Fire only the hooks of the projects the range affected
  (`pnpm turbo query affected --base=<old production sha>`); every hook fired is a build.

## Publishing is what updates /changelog

Step 7's blog build does **not** put the new release on `/changelog`. The releases fetch
sits behind `'use cache'` with a `max` profile and Vercel restores `.next/cache` between
builds, so an ordinary build replays the list it fetched last time.

`.github/workflows/changelog-deploy.yml` is the edge that does it: it fires on
`release: published`, POSTs the blog's Vercel deploy hook with `?buildCache=false`, and
then polls the deployed page for the tag rather than trusting that a deployment happened.
The hook (`changelog-deploy`) builds the `production` branch, which is why step 7 comes
first — published before the ship, the hook would rebuild the previous release's code, and
step 7's cached build would then serve it with whatever list its cache held.

It needs the `BLOG_DEPLOY_HOOK_URL` secret, holding that hook's URL (Vercel → the blog
project → Settings → Git → Deploy Hooks). Set it in the GitHub web UI or from a real
terminal — `gh secret set BLOG_DEPLOY_HOOK_URL` run from a non-interactive tool call stores
an empty value that still reads as set, which is exactly how v1.4.0 was published to a
changelog nothing could rebuild.

`changelog-check.yml` reads the deployed page back once a day and fails if it is showing
its unavailable note, or no releases at all.
