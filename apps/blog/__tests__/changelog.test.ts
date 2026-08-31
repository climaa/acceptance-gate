import { createElement } from 'react';
import fs from 'node:fs';
import path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { renderToStaticMarkup } from 'react-dom/server';
import * as runtime from 'react/jsx-runtime';
import { compile, run } from '@mdx-js/mdx';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { changelogMdxOptions, mdxComponents } from '../lib/mdx';
import { getReleases, narrativeTitle } from '../lib/releases';
import {
  CHANGELOG_RELEASE_LINK_PREFIX,
  CHANGELOG_UNAVAILABLE_NOTE,
  SITE_URL,
} from '../lib/site';

/**
 * The changelog's build-time half: what the page is given, and what a release
 * body turns into. Both are asserted here rather than in an e2e scenario,
 * because both are decided long before a browser is involved — per
 * CODING_STANDARDS, the lowest layer that can catch the failure.
 *
 * Nothing here reaches the network. The fixture path is the same one CI builds
 * with, so the shapes these tests assert on are the shapes the deployed
 * pipeline was exercised against.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('narrativeTitle', () => {
  // The reason this function exists: GitHub's `name` already opens with the tag,
  // so rendering the tag beside an unsplit name prints the version twice.
  it('drops the tag and the em-dash a release name opens with', () => {
    const title = narrativeTitle('v1.3.0 — the console gets a manual', 'v1.3.0');

    expect(title).toBe('the console gets a manual');
  });

  it('leaves a name that does not open with its tag whole', () => {
    expect(narrativeTitle('A release with its own ideas', 'v1.3.0')).toBe(
      'A release with its own ideas',
    );
  });

  // A name that opens with the tag but separates with something else is not
  // guessed at — dropping words from a title is worse than repeating a version.
  it('leaves a name whole when the separator is not an em-dash', () => {
    expect(narrativeTitle('v1.3.0: the console gets a manual', 'v1.3.0')).toBe(
      'v1.3.0: the console gets a manual',
    );
  });

  it('falls back to the tag when the release has no name', () => {
    expect(narrativeTitle(null, 'v1.3.0')).toBe('v1.3.0');
  });
});

describe('getReleases, built from the fixture', () => {
  function useFixture() {
    vi.stubEnv('BLOG_RELEASES_FIXTURE', '1');
  }

  it('publishes neither drafts nor prereleases', async () => {
    useFixture();

    const releases = await getReleases();

    expect(releases?.map((release) => release.tag)).toEqual([
      'v0.3.0',
      'v0.2.0',
      'v0.1.0',
    ]);
  });

  it('orders releases newest first', async () => {
    useFixture();

    const dates = (await getReleases())?.map((release) => release.date);

    expect(dates).toEqual(['2026-03-14', '2026-02-08', '2026-01-05']);
  });

  it('reduces a release to what the page renders', async () => {
    useFixture();

    const [latest] = (await getReleases()) ?? [];

    expect(latest).toMatchObject({
      tag: 'v0.3.0',
      title: 'the third fixture release, with a compare link',
      date: '2026-03-14',
      url: expect.stringContaining('/releases/tag/v0.3.0'),
    });
  });

  // The fixture switch has to win before any request is considered — a build
  // that reads the fixture *and* calls GitHub is still a build that hit the
  // live API, which is the thing the fixture exists to prevent.
  it('makes no request at all', async () => {
    useFixture();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await getReleases();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/**
 * Fail-open, and the three ways it is reached.
 *
 * `null` rather than an empty array throughout: an empty array is a legitimate
 * answer meaning "no releases yet", and a page that cannot tell the two apart
 * would render "nothing shipped" over a fetch that failed.
 */
describe('getReleases, when the build cannot establish the releases', () => {
  it('returns null when the request does not succeed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    expect(await getReleases()).toBeNull();
  });

  it('returns null when the request throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')));

    expect(await getReleases()).toBeNull();
  });

  // The case a status check cannot catch: a 200 carrying something that is not
  // a list of releases. Without the schema this renders an empty page, which
  // reads as "nothing shipped" rather than as a fault.
  it('returns null when a 200 does not describe releases', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: 'API rate limit exceeded' }),
      }),
    );

    expect(await getReleases()).toBeNull();
  });

  it('returns null when a release is missing a field the page renders', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ tag_name: 'v1.0.0', draft: false, prerelease: false }],
      }),
    );

    expect(await getReleases()).toBeNull();
  });
});

/**
 * The token is the documented answer to a rate limit, which means it gets
 * reached for under pressure — the worst moment to discover it was never
 * exercised. Both branches, because the unauthenticated one is the default and
 * a stray `authorization: Bearer undefined` would be a 401, not a fallback.
 */
describe('the optional token', () => {
  function stubOk() {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchSpy);
    return fetchSpy;
  }

  const headersOf = (spy: ReturnType<typeof vi.fn>) =>
    (spy.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers;

  it('authenticates when one is in the environment', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_example');
    const fetchSpy = stubOk();

    await getReleases();

    expect(headersOf(fetchSpy).authorization).toBe('Bearer ghp_example');
  });

  it('sends no authorization header when there is none', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    const fetchSpy = stubOk();

    await getReleases();

    expect(headersOf(fetchSpy)).not.toHaveProperty('authorization');
  });
});

/**
 * A release body is prose this repository did not write, compiled by the same
 * machinery that compiles its posts. Asserted on rendered markup rather than on
 * the plugin list, for content.test.ts's reason: a config that reads right and
 * renders the wrong thing is exactly what this catches.
 */
describe('the release body pipeline', () => {
  async function renderBody(source: string): Promise<string> {
    const compiled = await compile(source, {
      outputFormat: 'function-body',
      ...changelogMdxOptions.mdxOptions,
    });
    const { default: Content } = await run(compiled, runtime);

    return renderToStaticMarkup(createElement(Content, { components: mdxComponents }));
  }

  it('autolinks a bare #NNN to the repository', async () => {
    const html = await renderBody('Fixed in #427.');

    expect(html).toContain(
      '<a href="https://github.com/climaa/acceptance-gate/issues/427">#427</a>',
    );
  });

  // Both halves matter: no link inside a link, and the author's own destination
  // is left alone rather than rewritten to the issues path.
  it('leaves an already-linked reference alone', async () => {
    const html = await renderBody(
      'See [#242](https://github.com/climaa/acceptance-gate/pull/242).',
    );

    expect(html).toContain(
      '<a href="https://github.com/climaa/acceptance-gate/pull/242">#242</a>',
    );
    expect(html).not.toContain('/issues/242');
  });

  it('leaves a reference inside a code span literal', async () => {
    const html = await renderBody('A commit saying `Closes #12` auto-closed it.');

    expect(html).toContain('<code>Closes #12</code>');
    expect(html).not.toContain('/issues/12');
  });

  it('does not treat a number after a word character as a reference', async () => {
    const html = await renderBody('The ref is abc#12 and not a link.');

    expect(html).not.toContain('/issues/');
  });

  // This repository writes about colours, so a six-digit run after a hash is
  // more likely a hex value than an issue number a hundred thousand away.
  it('does not link a hex colour', async () => {
    const html = await renderBody('The token resolves to #123456 today.');

    expect(html).not.toContain('/issues/');
  });

  // GFM autolink literals already cover this; the test pins that they are on,
  // because two of the four real bodies end with a bare compare URL.
  it('links a bare compare URL', async () => {
    const html = await renderBody(
      'Full changelog: https://github.com/climaa/acceptance-gate/compare/v1.2.0...v1.3.0',
    );

    expect(html).toContain(
      '<a href="https://github.com/climaa/acceptance-gate/compare/v1.2.0...v1.3.0">',
    );
  });

  it('renders a GFM table', async () => {
    const html = await renderBody('| A | B |\n| - | - |\n| 1 | 2 |\n');

    expect(html).toContain('<table>');
  });

  // The body's own `##` sits under the entry's `h2`, so it has to become `h3`
  // or the outline contradicts the layout.
  it('pushes the body headings one level down', async () => {
    const html = await renderBody('## What changed\n\nSomething did.\n');

    expect(html).toContain('<h3>What changed</h3>');
  });

  /**
   * The reason the pipeline is compiled as markdown rather than MDX. Release
   * bodies are written on github.com, where a brace is a brace — under MDX it
   * opens an expression, and the build fails on prose nobody in this repository
   * can lint.
   */
  it('renders a brace in a body as a literal brace', async () => {
    const html = await renderBody('A literal {brace} in prose.');

    expect(html).toContain('{brace}');
  });

  /**
   * An angle bracket is the half markdown format does NOT rescue, and the
   * behaviour is worth pinning because it is lossy rather than loud.
   *
   * `<Tag>` parses as inline HTML, and with no `rehype-raw` in this pipeline a
   * raw node is dropped instead of rendered — the sentence survives, the tag
   * does not. Adding `rehype-raw` would fix the fidelity and hand a body
   * written outside this repository the ability to inject markup into the
   * blog, which is a worse trade. The prose that matters puts type signatures
   * in code spans, where nothing is dropped — the case below.
   */
  it('drops an unknown inline tag without failing the build', async () => {
    const html = await renderBody('A sentence with a <Tag> in it.');

    expect(html).toContain('A sentence with a');
    expect(html).toContain('in it.');
    expect(html).not.toContain('<Tag>');
  });

  it('keeps MDX-hostile characters inside a code span', async () => {
    const html = await renderBody('Use `Array<{ id: string }>` here.');

    expect(html).toContain('<code>Array&lt;{ id: string }&gt;</code>');
  });
});

/**
 * The page's own fail-open branch.
 *
 * `getReleases` returning `null` is asserted above; that this is what a reader
 * then sees is a different claim, and it is the one the whole fail-open policy
 * is for. Rendered rather than reasoned about: the null branch is entirely
 * synchronous, so the page can be awaited once and rendered like any element.
 */
describe('the changelog page, when the releases are unavailable', () => {
  async function renderPage(releases: Awaited<ReturnType<typeof getReleases>>) {
    vi.doMock('../lib/releases', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../lib/releases')>()),
      getReleases: async () => releases,
    }));
    const { default: ChangelogPage } = await import('../app/changelog/page');

    return renderToStaticMarkup(await ChangelogPage());
  }

  afterEach(() => {
    vi.doUnmock('../lib/releases');
    vi.resetModules();
  });

  it('says so in the written copy rather than rendering an empty page', async () => {
    const html = await renderPage(null);

    expect(html).toContain(CHANGELOG_UNAVAILABLE_NOTE);
  });

  it('offers the way on that the copy promises', async () => {
    const html = await renderPage(null);

    expect(html).toContain('href="https://github.com/climaa/acceptance-gate/releases"');
  });

  // The route still renders: a failed fetch is not a broken address, and the
  // page keeps its heading so the nav does not lead somewhere blank.
  it('still renders as the changelog', async () => {
    const html = await renderPage(null);

    expect(html).toContain('Changelog');
  });

  // The distinction the schema exists to preserve, asserted from the outside:
  // no releases yet is not the same event as a fetch that failed.
  it('does not show the note when there are simply no releases', async () => {
    const html = await renderPage([]);

    expect(html).not.toContain(CHANGELOG_UNAVAILABLE_NOTE);
  });
});

/**
 * The scheduled check greps the deployed page for sentences that live in
 * TypeScript, from a workflow written in YAML. Nothing but this test keeps the
 * two in step, and the failure it prevents is the worst kind: reword the copy
 * and the alarm goes on passing while the page says something else entirely.
 *
 * The origin is here for the same reason and a sharper one. Adding a custom
 * domain leaves the `.vercel.app` alias resolving, so a workflow still pointed
 * at it would keep polling a site nobody reads and keep reporting green.
 * `lib/site.ts` promises `SITE_URL` is the only line to edit; these assertions
 * are what make that true of the workflows too.
 */
describe('the workflows that watch the deployed page', () => {
  const workflow = (name: string) =>
    fs.readFileSync(
      path.join(process.cwd(), '..', '..', '.github', 'workflows', name),
      'utf8',
    );

  /** A `KEY: value` or `KEY: 'value'` pair from a workflow's env block. */
  const envValue = (yaml: string, key: string) => {
    const [, quoted, bare] = new RegExp(`${key}: (?:'([^']+)'|(\\S+))`).exec(yaml) ?? [];
    return quoted ?? bare;
  };

  it.each(['changelog-check.yml', 'changelog-deploy.yml'])(
    '%s polls the origin lib/site.ts names',
    (name) => {
      expect(envValue(workflow(name), 'ORIGIN')).toBe(SITE_URL.origin);
    },
  );

  it('changelog-check.yml greps for a substring of the unavailable note', () => {
    const needle = envValue(workflow('changelog-check.yml'), 'UNAVAILABLE');

    expect(needle).toBeDefined();
    expect(CHANGELOG_UNAVAILABLE_NOTE).toContain(needle);
  });

  // The other half of that check: it also asserts the page shows releases, so a
  // page rendering neither them nor the note is not mistaken for a healthy one.
  it('changelog-check.yml greps for the text every release link opens with', () => {
    const needle = envValue(workflow('changelog-check.yml'), 'RELEASES_PRESENT');

    expect(needle).toBeDefined();
    expect(CHANGELOG_RELEASE_LINK_PREFIX).toContain(needle);
  });
});
