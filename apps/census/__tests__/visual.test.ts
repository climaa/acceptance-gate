import { describe, expect, it } from 'vitest';

import {
  appComponents,
  appModules,
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

  it('lists each component by name and tier, with its story, its board and its baseline', () => {
    const tiled = new Set(['atoms-badge--neutral', 'molecules-card--default']);
    const boards = new Map([
      ['atoms-badge--neutral', '01-atoms'],
      ['molecules-card--default', '02-molecules'],
    ]);
    const baselined = new Set(['atoms-badge--neutral']);

    const visual = uiVisual(files, [badge, card], tiled, baselined, new Map(), boards);

    expect(visual.value.state === 'measured' && visual.value.inventory).toEqual([
      {
        name: 'Badge',
        tier: 'atoms',
        story: 'atoms-badge--neutral',
        tiled: true,
        board: '01-atoms',
        baselined: true,
      },
      {
        name: 'Card',
        tier: 'molecules',
        story: 'molecules-card--default',
        tiled: true,
        board: '02-molecules',
        baselined: false,
      },
      { name: 'Shell', tier: 'organisms', tiled: false, baselined: false },
    ]);
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
      inventory: [
        {
          name: 'screens-blog-home--latest',
          tier: 'screens',
          story: 'screens-blog-home--latest',
          tiled: false,
          baselined: true,
        },
      ],
    });
  });

  it('lists a tiled screen with the board its tile is on', () => {
    const visual = appVisual('apps/blog', {
      components,
      imports,
      stories: [screen],
      tiled: new Set(['screens-blog-home--latest']),
      boards: new Map([['screens-blog-home--latest', '05-screens-blog-1']]),
      baselined: new Set(),
    });

    expect(visual.value.state === 'measured' && visual.value.inventory).toEqual([
      {
        name: 'screens-blog-home--latest',
        tier: 'screens',
        story: 'screens-blog-home--latest',
        tiled: true,
        board: '05-screens-blog-1',
        baselined: false,
      },
    ]);
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
      inventory: [],
    });
  });
});

describe('appModules', () => {
  it('lists the value imports and re-exports a module makes, and the components it renders', () => {
    const source = [
      "import { Feed } from '@/components/Feed';",
      "import {\n  Card,\n  type CardProps,\n} from '../../components/Card.tsx';",
      "import type { Post } from '@/lib/post';",
      "import { type Tag } from '@/lib/tag';",
      "export { Shell } from './Shell';",
      "export type { Theme } from './theme';",
      "import { Badge } from '@gate/ui';",
      "const Scene = dynamic(() => import('./Scene'));",
      'export const Home = (p: Array<Post>) => <Feed posts={useState<Post>()}><Card /></Feed>;',
    ].join('\n');

    const modules = appModules([{ path: 'apps/blog/app/_screens/home.tsx', source }]);

    const home = modules.get('apps/blog/app/_screens/home');
    expect([...(home?.imports ?? [])].sort()).toEqual([
      'apps/blog/app/_screens/Shell',
      'apps/blog/components/Card',
      'apps/blog/components/Feed',
    ]);
    expect([...(home?.renders ?? [])].sort()).toEqual(['Card', 'Feed']);
  });

  it('names a folder index module by its folder', () => {
    const modules = appModules([
      { path: 'apps/blog/components/Feed/index.ts', source: "export * from './Feed';" },
    ]);

    expect([...(modules.get('apps/blog/components/Feed')?.imports ?? [])]).toEqual([
      'apps/blog/components/Feed/Feed',
    ]);
  });
});

describe('appVisual through a screen story', () => {
  const STORY = 'apps/blog/app/_screens/home.stories.tsx';
  const screen: Story = { id: 'screens-blog-home--latest', file: STORY, skipped: false };
  const other: Story = {
    id: 'screens-blog-post--latest',
    file: 'apps/blog/app/_screens/post.stories.tsx',
    skipped: false,
  };
  const component = (name: string, file = `apps/blog/components/${name}.tsx`) => ({
    name,
    file,
  });
  const storied = (
    components: { name: string; file: string }[],
    files: { path: string; source: string }[],
    stories: Story[] = [screen],
    tiled: ReadonlySet<string> = new Set(),
  ) => {
    const imports = new Map(
      files
        .filter((f) => f.path.endsWith('.stories.tsx'))
        .map((f) => [f.path, storyImports(f.path, f.source)]),
    );
    return appVisual('apps/blog', {
      components,
      imports,
      modules: appModules(files),
      stories,
      tiled,
      baselined: new Set(),
    });
  };

  it('counts a component the story imports directly, as before', () => {
    const visual = storied(
      [component('Feed')],
      [{ path: STORY, source: "import { Feed } from '@/components/Feed';" }],
    );

    expect(visual.unstoried).toEqual([]);
  });

  it('counts a component rendered by one the story renders', () => {
    const visual = storied(
      [component('Feed'), component('PostCard')],
      [
        { path: STORY, source: "import { Feed } from '@/components/Feed';\n<Feed />" },
        {
          path: 'apps/blog/components/Feed.tsx',
          source:
            "import { PostCard } from './PostCard';\nexport const Feed = () => <PostCard />;",
        },
        {
          path: 'apps/blog/components/PostCard.tsx',
          source: 'export const PostCard = () => null;',
        },
      ],
    );

    expect(visual.unstoried).toEqual([]);
  });

  it('counts a component two components deep, through relative and @/ specifiers', () => {
    const visual = storied(
      [
        component('Feed'),
        component('PostCard'),
        component('Tag', 'apps/blog/lib/ui/Tag.tsx'),
      ],
      [
        {
          path: STORY,
          source: "import { Feed } from '../../components/Feed';\n<Feed />",
        },
        {
          path: 'apps/blog/components/Feed.tsx',
          source: "import { PostCard } from '@/components/PostCard';\n<PostCard />",
        },
        {
          path: 'apps/blog/components/PostCard.tsx',
          source: "import { Tag } from '../lib/ui/Tag.tsx';\n<Tag label='x' />",
        },
        { path: 'apps/blog/lib/ui/Tag.tsx', source: 'export const Tag = () => null;' },
      ],
    );

    expect(visual.unstoried).toEqual([]);
  });

  it('follows a re-export', () => {
    const visual = storied(
      [component('PostCard', 'apps/blog/components/cards/PostCard.tsx')],
      [
        {
          path: STORY,
          source: "import { PostCard } from '@/components/cards';\n<PostCard />",
        },
        {
          path: 'apps/blog/components/cards/index.ts',
          source: "export { PostCard } from './PostCard';",
        },
        {
          path: 'apps/blog/components/cards/PostCard.tsx',
          source: 'export const PostCard = () => null;',
        },
      ],
    );

    expect(visual.unstoried).toEqual([]);
  });

  it('ends on an import cycle', () => {
    const visual = storied(
      [component('A'), component('Bee'), component('Cee')],
      [
        { path: STORY, source: "import { A } from '@/components/A';\n<A />" },
        {
          path: 'apps/blog/components/A.tsx',
          source: "import { Bee } from './Bee';\n<Bee />",
        },
        {
          path: 'apps/blog/components/Bee.tsx',
          source: "import { A } from './A';\n<A />",
        },
      ],
    );

    expect(visual.unstoried).toEqual(['Cee']);
  });

  it('does not count a component reached only through a type-only import', () => {
    const visual = storied(
      [component('Feed'), component('PostCard')],
      [
        { path: STORY, source: "import { Feed } from '@/components/Feed';\n<Feed />" },
        {
          path: 'apps/blog/components/Feed.tsx',
          source: "import type { PostCard } from './PostCard';\n<PostCard />",
        },
      ],
    );

    expect(visual.unstoried).toEqual(['PostCard']);
  });

  it('does not count a component behind a dynamic import', () => {
    const visual = storied(
      [component('Pyramid'), component('Scene')],
      [
        {
          path: STORY,
          source: "import { Pyramid } from '@/components/Pyramid';\n<Pyramid />",
        },
        {
          path: 'apps/blog/components/Pyramid.tsx',
          source: "const Scene = dynamic(() => import('./Scene'));\n<Scene />",
        },
      ],
    );

    expect(visual.unstoried).toEqual(['Scene']);
  });

  it('does not count a reached component no reached module renders', () => {
    const visual = storied(
      [component('Feed'), component('Unused')],
      [
        { path: STORY, source: "import { Feed } from '@/components/Feed';\n<Feed />" },
        {
          path: 'apps/blog/components/Feed.tsx',
          source: "import { Unused } from './Unused';\nexport const Feed = () => null;",
        },
      ],
    );

    expect(visual.unstoried).toEqual(['Unused']);
  });

  it("does not walk another workspace's modules", () => {
    const visual = storied(
      [component('PostCard')],
      [
        {
          path: STORY,
          source: "import { Thing } from '../../../manual/components/Thing';\n<Thing />",
        },
        {
          path: 'apps/manual/components/Thing.tsx',
          source:
            "import { PostCard } from '../../blog/components/PostCard';\n<PostCard />",
        },
      ],
    );

    expect(visual.unstoried).toEqual(['PostCard']);
  });

  it('does not walk from a test', () => {
    const visual = storied(
      [component('Feed')],
      [
        {
          path: 'apps/blog/__tests__/feed.test.tsx',
          source: "import { Feed } from '@/components/Feed';\n<Feed />",
        },
      ],
    );

    expect(visual.unstoried).toEqual(['Feed']);
  });

  it('judges a component reached through several stories by all of them', () => {
    const files = [
      { path: STORY, source: "import { Feed } from '@/components/Feed';\n<Feed />" },
      { path: other.file, source: "import { Feed } from '@/components/Feed';\n<Feed />" },
      {
        path: 'apps/blog/components/Feed.tsx',
        source: "import { PostCard } from './PostCard';\n<PostCard />",
      },
    ];
    const visual = storied(
      [component('PostCard')],
      files,
      [screen, other],
      new Set([screen.id]),
    );

    expect(visual.value.state === 'measured' && visual.value.components).toEqual({
      total: 1,
      storied: 1,
      tiled: 0,
      baselined: 0,
    });
  });
});
