import { describe, expect, it } from 'vitest';

import {
  appComponents,
  appVisual,
  indexStories,
  storyIdsOf,
  storyImports,
  storyParts,
  uiVisual,
  type Story,
} from '@/lib/collect/visual.ts';

const INDEX = {
  v: 5,
  entries: {
    'atoms-badge--neutral': {
      type: 'story',
      id: 'atoms-badge--neutral',
      importPath: '../../packages/ui/src/atoms/Badge/Badge.stories.tsx',
      tags: ['dev'],
    },
    'atoms-badge--docs': {
      type: 'docs',
      id: 'atoms-badge--docs',
      importPath: 'x.mdx',
      tags: [],
    },
    'screens-blog-home--latest': {
      type: 'story',
      id: 'screens-blog-home--latest',
      importPath: '../blog/app/_screens/home.stories.tsx',
      tags: ['dev', 'visual-diff:skip'],
    },
  },
};

describe('indexStories', () => {
  it('keeps stories, drops docs pages, and makes import paths repo-relative', () => {
    const stories = indexStories(INDEX);

    expect(stories).toEqual([
      {
        id: 'atoms-badge--neutral',
        file: 'packages/ui/src/atoms/Badge/Badge.stories.tsx',
        skipped: false,
      },
      {
        id: 'screens-blog-home--latest',
        file: 'apps/blog/app/_screens/home.stories.tsx',
        skipped: true,
      },
    ]);
  });

  it('refuses a file that is not a Storybook index', () => {
    expect(() => indexStories({ entries: 'none' })).toThrow(/index/);
  });
});

describe('storyIdsOf', () => {
  it('takes the story id from the end of each variant key', () => {
    const ids = storyIdsOf([
      'atoms__desktop__light__atoms-badge--neutral.png',
      'screens__mobile__dark__screens-blog-home--latest',
    ]);

    expect([...ids].sort()).toEqual([
      'atoms-badge--neutral',
      'screens-blog-home--latest',
    ]);
  });
});

const badge: Story = {
  id: 'atoms-badge--neutral',
  file: 'packages/ui/src/atoms/Badge/Badge.stories.tsx',
  skipped: false,
};
const card: Story = {
  id: 'molecules-card--default',
  file: 'packages/ui/src/molecules/Card/Card.stories.tsx',
  skipped: false,
};
const skipped: Story = {
  id: 'atoms-spinner--default',
  file: 'packages/ui/src/atoms/Spinner/Spinner.stories.tsx',
  skipped: true,
};

describe('storyParts', () => {
  it('names the tile and the baseline a story lacks', () => {
    const parts = storyParts([card], new Set(), new Set());

    expect(parts).toEqual([
      { storyId: 'molecules-card--default', missing: ['tile', 'baseline'] },
    ]);
  });

  it('never asks a skipped story for a baseline', () => {
    const parts = storyParts([skipped], new Set(['atoms-spinner--default']), new Set());

    expect(parts).toEqual([{ storyId: 'atoms-spinner--default', missing: [] }]);
  });
});

describe('uiVisual', () => {
  const files = [
    'packages/ui/src/atoms/Badge/Badge.tsx',
    'packages/ui/src/atoms/Badge/Badge.stories.tsx',
    'packages/ui/src/molecules/Card/Card.tsx',
    'packages/ui/src/molecules/Card/Card.stories.tsx',
    'packages/ui/src/organisms/Shell/Shell.tsx',
    'packages/ui/src/index.ts',
    'packages/ui/src/tokens.css',
  ];

  it('counts each component folder, and which are storied, tiled and baselined', () => {
    const tiled = new Set(['atoms-badge--neutral', 'molecules-card--default']);
    const baselined = new Set(['atoms-badge--neutral']);

    const visual = uiVisual(files, [badge, card], tiled, baselined, new Map());

    expect(visual.value.components).toEqual({
      total: 3,
      storied: 2,
      tiled: 2,
      baselined: 1,
    });
  });

  it('names a component folder no story lives in', () => {
    const visual = uiVisual(files, [badge, card], new Set(), new Set(), new Map());

    expect(visual.unstoried).toEqual(['Shell']);
  });

  it("counts a folder with no story of its own as storied when another component's story imports it", () => {
    const imports = new Map([
      [badge.file, new Set(['packages/ui/src/organisms/Shell/Shell'])],
    ]);

    const visual = uiVisual(files, [badge, card], new Set(), new Set(), imports);

    expect(visual.unstoried).toEqual([]);
  });
});

describe('appComponents', () => {
  it('lists every PascalCase export of a component file', () => {
    const components = appComponents([
      {
        path: 'apps/blog/components/PostCard.tsx',
        source:
          'export function PostCard() {}\nexport const PostMeta = () => null;\nexport function usePost() {}',
      },
      {
        path: 'apps/blog/components/Feed.tsx',
        source: 'export default function Feed() {}',
      },
    ]);

    expect(components).toEqual([
      { name: 'PostCard', file: 'apps/blog/components/PostCard.tsx' },
      { name: 'PostMeta', file: 'apps/blog/components/PostCard.tsx' },
      { name: 'Feed', file: 'apps/blog/components/Feed.tsx' },
    ]);
  });

  it('skips route files, screen stories, stories and tests', () => {
    const components = appComponents(
      [
        'apps/blog/app/page.tsx',
        'apps/blog/app/layout.tsx',
        'apps/blog/app/_screens/home.tsx',
        'apps/blog/components/Feed.stories.tsx',
        'apps/blog/__tests__/Feed.test.tsx',
      ].map((path) => ({ path, source: 'export function Page() {}' })),
    );

    expect(components).toEqual([]);
  });

  it('skips metadata image routes, which render an image response, not a page', () => {
    const components = appComponents(
      [
        'apps/visual-diff-ui/app/report/[id]/compare/[key]/opengraph-image.tsx',
        'apps/blog/app/twitter-image.tsx',
        'apps/blog/app/icon.tsx',
        'apps/blog/app/icon2.tsx',
        'apps/blog/app/apple-icon.tsx',
      ].map((path) => ({ path, source: 'export default async function Image() {}' })),
    );

    expect(components).toEqual([]);
  });
});

describe('storyImports', () => {
  it("resolves relative and '@/' specifiers to repo paths without extension", () => {
    const source = [
      "import { Feed } from '@/components/Feed';",
      "import { Card } from '../../components/Card.tsx';",
      "import { Badge } from '@gate/ui';",
    ].join('\n');

    const targets = storyImports('apps/blog/app/_screens/home.stories.tsx', source);

    expect([...targets].sort()).toEqual([
      'apps/blog/components/Card',
      'apps/blog/components/Feed',
    ]);
  });
});

describe('appVisual', () => {
  const screen: Story = {
    id: 'screens-blog-home--latest',
    file: 'apps/blog/app/_screens/home.stories.tsx',
    skipped: false,
  };
  const components = [
    { name: 'Feed', file: 'apps/blog/components/Feed.tsx' },
    { name: 'PostCard', file: 'apps/blog/components/PostCard.tsx' },
  ];
  const imports = new Map([
    ['apps/blog/app/_screens/home.stories.tsx', new Set(['apps/blog/components/Feed'])],
  ]);
  const routes = {
    total: 1,
    loading: { own: 0, inherited: 0, none: 1 },
    error: { own: 1, inherited: 0, none: 0 },
    notFound: { own: 1, inherited: 0, none: 0 },
  };

  it('counts app components by the stories that import them, and the screens', () => {
    const visual = appVisual('apps/blog', {
      components,
      imports,
      stories: [screen],
      tiled: new Set(),
      baselined: new Set(['screens-blog-home--latest']),
      routes,
    });

    expect(visual.value).toEqual({
      dimension: 'visual',
      state: 'measured',
      components: { total: 2, storied: 1, tiled: 0, baselined: 1 },
      screens: { stories: 1, tiled: 0, baselined: 1 },
      routes,
    });
  });

  it('names each app component no story imports', () => {
    const visual = appVisual('apps/blog', {
      components,
      imports,
      stories: [screen],
      tiled: new Set(),
      baselined: new Set(),
      routes,
    });

    expect(visual.unstoried).toEqual(['PostCard']);
  });

  it('names a component once when two files export the same name', () => {
    const visual = appVisual('apps/blog', {
      components: [
        ...components,
        { name: 'PostCard', file: 'apps/blog/components/old/PostCard.tsx' },
      ],
      imports,
      stories: [screen],
      tiled: new Set(),
      baselined: new Set(),
      routes,
    });

    expect(visual.unstoried).toEqual(['PostCard']);
  });
});

describe('appVisual without screens or routes', () => {
  it('leaves screens and routes out of the value', () => {
    const visual = appVisual('apps/census', {
      components: [],
      imports: new Map(),
      stories: [],
      tiled: new Set(),
      baselined: new Set(),
    });

    expect(visual.value).toEqual({
      dimension: 'visual',
      state: 'measured',
      components: { total: 0, storied: 0, tiled: 0, baselined: 0 },
    });
  });
});
