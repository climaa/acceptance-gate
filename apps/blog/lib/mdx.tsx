import { isValidElement, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import type { MDXRemoteProps } from 'next-mdx-remote/rsc';
import rehypeAutolinkHeadings, {
  type Build,
  type Options as AutolinkOptions,
} from 'rehype-autolink-headings';
import rehypePrettyCode, { type Options as PrettyCodeOptions } from 'rehype-pretty-code';
import rehypeSlug from 'rehype-slug';
import { CodeBlock } from '@gate/ui';

/**
 * The build-time MDX pipeline: highlighting, heading ids, heading anchors.
 *
 * Every plugin here runs once, at build time. Nothing in this file reaches the
 * browser, and no client-side highlighter exists to disagree with it.
 */

/**
 * One theme, named outright.
 *
 * The slab is dark in BOTH themes — `--color-code-bg` resolves to `--c-umber-950`
 * in light and `--c-ink-900` in dark, two near-black steps — so a second theme
 * would repaint tokens that never sit on a different ground. That also keeps the
 * markup free of `--shiki-*` custom properties and of any `prefers-color-scheme`
 * query, which CODING_STANDARDS rules out: `[data-theme]` is the only theme
 * mechanism, and a media query is invisible to Storybook and to the differ.
 */
const SHIKI_THEME = 'github-dark-dimmed';

const prettyCodeOptions: PrettyCodeOptions = {
  theme: SHIKI_THEME,
  // The slab's ground is `--color-code-bg` on `.ds-code__pre`. Shiki's own
  // background would paint over the token and stop following the theme.
  keepBackground: false,
};

/**
 * A hast node the plugin accepts as anchor content. Derived from the plugin's
 * own `Build` signature rather than imported from `hast`, which is not a
 * dependency of this app.
 */
type HeadingContent = Extract<ReturnType<Build>, unknown[]>[number];

/** Concatenated text of a heading, used to name its anchor. */
function textOf(node: HeadingContent): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') return node.children.map(textOf).join('');
  return '';
}

// "#" alone announces as "number sign, link", and every heading on the page
// would announce identically. The visible symbol is decoration; the hidden
// label carries the destination.
const anchorContent: Build = (heading) => [
  {
    type: 'element',
    tagName: 'span',
    properties: { ariaHidden: 'true' },
    children: [{ type: 'text', value: '#' }],
  },
  {
    type: 'element',
    tagName: 'span',
    properties: { className: ['ds-visually-hidden'] },
    children: [
      { type: 'text', value: `Link to ${heading.children.map(textOf).join('')}` },
    ],
  },
];

const autolinkOptions: AutolinkOptions = {
  behavior: 'append',
  // Naming `properties` drops the plugin's `{ariaHidden: true, tabIndex: -1}`
  // default, which is what makes the anchor a real, reachable link.
  properties: { className: ['heading-anchor'] },
  content: anchorContent,
};

type MdxCompileOptions = NonNullable<
  NonNullable<MDXRemoteProps['options']>['mdxOptions']
>;

/**
 * Order is load-bearing: `rehype-autolink-headings` only links headings that
 * already carry an id, so `rehype-slug` has to run first.
 */
export const rehypePlugins: NonNullable<MdxCompileOptions['rehypePlugins']> = [
  [rehypePrettyCode, prettyCodeOptions],
  rehypeSlug,
  [rehypeAutolinkHeadings, autolinkOptions],
];

type PreProps = ComponentPropsWithoutRef<'pre'> & { 'data-language'?: string };

/**
 * Every fenced block renders as the design system's slab.
 *
 * rehype-pretty-code nests its token spans in its own `<code>`; `CodeBlock`
 * supplies one too, so the inner element is unwrapped rather than rendered —
 * `<code>` inside `<code>` would take the inline-chip styling twice. The line
 * breaks survive the unwrap: the highlighter leaves a `\n` text node between
 * every `<span data-line>`, and `<pre>` preserves it.
 */
function Pre({ children, ...props }: PreProps) {
  const tokens = isValidElement<{ children?: ReactNode }>(children)
    ? children.props.children
    : children;

  return <CodeBlock language={props['data-language']}>{tokens}</CodeBlock>;
}

/**
 * rehype-pretty-code wraps every block in a `<figure>` with no caption in it.
 * The UA stylesheet gives that figure a 40px inline margin, which indents the
 * slab out of the prose column; `CodeBlock` is the wrapper the block needs.
 * Any other figure an author writes is left alone.
 */
function Figure({ children, ...props }: ComponentPropsWithoutRef<'figure'>) {
  if ('data-rehype-pretty-code-figure' in props) return <>{children}</>;

  return <figure {...props}>{children}</figure>;
}

export const mdxComponents = {
  pre: Pre,
  figure: Figure,
} satisfies MDXRemoteProps['components'];

export const mdxRemoteOptions: NonNullable<MDXRemoteProps['options']> = {
  mdxOptions: { rehypePlugins },
};
