import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { PREVIEW_TAGS, pngSize, type Preview } from '../../pages/link-preview';
import { test, type ScenarioState } from './fixtures';

const { When, Then } = createBdd(test);

// Duplicated from apps/blog/lib/og.tsx on purpose: an expectation that imports
// the value under test cannot catch that value being wrong. 1.91:1 is what
// Facebook, X, LinkedIn and Slack all crop to.
const CARD = { width: 1200, height: 630 };

function previewsOf({ previews }: ScenarioState): Preview[] {
  if (!previews?.length) {
    throw new Error(
      'No page was read — a "When … reads" or "requests" step must run first.',
    );
  }
  return previews;
}

function onlyPreview(state: ScenarioState): Preview {
  const [preview] = previewsOf(state);
  return preview as Preview;
}

function content(preview: Preview, name: string): string | undefined {
  return preview.tags.get(name)?.content;
}

function duplicates(values: (string | undefined)[]): (string | undefined)[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

When('a crawler reads {}', async ({ linkPreviews, scenarioState }, page: string) => {
  if (page === 'every page in the sitemap') {
    scenarioState.previews = await linkPreviews.readAll();
    return;
  }
  scenarioState.previews = [await linkPreviews.read(await linkPreviews.pathOf(page))];
});

When(
  '{} requests every page in the sitemap',
  async ({ linkPreviews, scenarioState }, crawler: string) => {
    scenarioState.previews = await linkPreviews.readAll(crawler);
  },
);

Then('the preview has a title and a description', ({ scenarioState }) => {
  const preview = onlyPreview(scenarioState);

  expect(content(preview, 'og:title')).toBeTruthy();
  expect(content(preview, 'og:description')).toBeTruthy();
});

Then(
  "the preview's address is the page's canonical address",
  async ({ linkPreviews, scenarioState }) => {
    const preview = onlyPreview(scenarioState);
    const { origin } = await linkPreviews.sitemap();

    const address = new URL(content(preview, 'og:url') ?? '', 'invalid:/');

    expect(address.origin).toBe(origin);
    expect(address.pathname).toBe(preview.path);
    expect(preview.canonical).toBe(content(preview, 'og:url'));
  },
);

Then(
  "the preview's image has an absolute address",
  async ({ linkPreviews, scenarioState }) => {
    const preview = onlyPreview(scenarioState);
    const { origin } = await linkPreviews.sitemap();

    const image = new URL(content(preview, 'og:image') ?? '', 'invalid:/');

    expect(image.origin).toBe(origin);
  },
);

Then(
  'no two pages share a preview title, description or address',
  ({ scenarioState }) => {
    const previews = previewsOf(scenarioState);

    for (const name of ['og:title', 'og:description', 'og:url']) {
      expect(duplicates(previews.map((preview) => content(preview, name))), name).toEqual(
        [],
      );
    }
  },
);

Then('no two articles share a preview image', ({ scenarioState }) => {
  const articles = previewsOf(scenarioState).filter(
    (preview) => content(preview, 'og:type') === 'article',
  );

  expect(articles.length).toBeGreaterThan(0);
  expect(duplicates(articles.map((preview) => content(preview, 'og:image')))).toEqual([]);
});

Then('every page answers 200 without a redirect', ({ scenarioState }) => {
  const answers = previewsOf(scenarioState).map(({ path, status }) => ({ path, status }));

  expect(answers.filter(({ status }) => status !== 200)).toEqual([]);
});

Then(
  'every page carries its preview tags inside the server-rendered head',
  ({ scenarioState }) => {
    const misplaced = previewsOf(scenarioState).flatMap((preview) =>
      PREVIEW_TAGS.filter((name) => !preview.tags.get(name)?.inHead).map(
        (name) => `${preview.path} ${name}`,
      ),
    );

    expect(misplaced).toEqual([]);
  },
);

Then(
  'every preview image answers 200 as a 1200x630 PNG',
  async ({ linkPreviews, scenarioState }) => {
    const addresses = new Set(
      previewsOf(scenarioState).map((preview) => content(preview, 'og:image') ?? ''),
    );

    for (const address of addresses) {
      const image = await linkPreviews.image(address);

      expect(image.status, address).toBe(200);
      expect(image.contentType, address).toBe('image/png');
      expect(pngSize(image.bytes), address).toEqual(CARD);
    }
  },
);
