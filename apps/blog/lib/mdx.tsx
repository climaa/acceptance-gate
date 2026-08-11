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
 * Two themes, one per site theme.
 *
 * The slab is now a light plate in light mode and a dark one in dark mode —
 * `--color-code-bg` no longer resolves to the same near-black step in both, so
 * a single baked-in palette can no longer serve both grounds. `rose-pine-dawn`
 * pairs with the light plate rather than `github-light`: its native background
 * (`#faf4ed`) sits in the same warm-cream family as `--c-cream-50`, so its
 * token colours read as designed for this ground rather than transplanted
 * from a cool white one.
 *
 * Passing an OBJECT here (rather than a single theme id) makes rehype-pretty-
 * code set Shiki's `defaultColor: false` internally, which emits every token
 * span as `style="--shiki-light:#..;--shiki-dark:#.."` with no plain `color`.
 * `CodeBlock.css` picks between the two with the same `[data-theme='dark']`
 * attribute selector the rest of the design system uses — never
 * `prefers-color-scheme`, which CODING_STANDARDS rules out because it is
 * invisible to Storybook and to the differ.
 */
const SHIKI_THEME = { light: 'rose-pine-dawn', dark: 'github-dark-dimmed' } as const;

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
    children: [{ type: 'text', value: `Link to ${textOf(heading)}` }],
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
function Pre({ children, 'data-language': language }: PreProps) {
  const tokens = isValidElement<{ children?: ReactNode }>(children)
    ? children.props.children
    : children;

  return <CodeBlock language={language}>{tokens}</CodeBlock>;
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
