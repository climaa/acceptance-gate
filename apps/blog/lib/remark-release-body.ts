import { ISSUE_URL_BASE } from './github';

/**
 * The two transforms a release body needs that a post body must not get.
 *
 * Release prose is written on github.com, where `#427` is a link and a body
 * nests its own `##` headings under a title the page supplies. Rendered here
 * with neither, the cross-references go dead and the outline flattens. Both
 * plugins are scoped to `/changelog` for that reason: a post that mentions
 * "#3" means the number three.
 *
 * Written against the mdast shapes actually used rather than typed from
 * `@types/mdast`, which is not a dependency here and would be one more package
 * to keep in step with remark for two small tree walks.
 */
interface MdNode {
  type: string;
  value?: string;
  url?: string;
  depth?: number;
  children?: MdNode[];
}

/**
 * `#` after a word character is not a reference — `abc#12` is part of something
 * else. The prefix is captured rather than looked behind so the split can put
 * it back as text.
 *
 * Five digits at most, and the ceiling is not arbitrary: `#123456` is a hex
 * colour, this repository writes about colours, and linking one to an issue
 * that will not exist for a hundred thousand issues is the one false positive
 * worth designing against. Three-digit shorthand colours stay ambiguous — so
 * does GitHub's own rendering of them — and are linked.
 */
const REFERENCE = /(^|[^\w`])#(\d{1,5})\b/g;

/** A text node broken into the literal runs and the references between them. */
function splitReferences(value: string): MdNode[] {
  const out: MdNode[] = [];
  let consumed = 0;

  for (const match of value.matchAll(REFERENCE)) {
    // Both groups always participate — `(^|[^\w`])` matches the empty string at
    // the start — but the standard types cannot say so, and defaulting is
    // cheaper than asserting they are there.
    const [whole, prefix = '', digits = ''] = match;
    const start = match.index + prefix.length;

    if (start > consumed) out.push({ type: 'text', value: value.slice(consumed, start) });
    out.push({
      type: 'link',
      url: `${ISSUE_URL_BASE}/${digits}`,
      children: [{ type: 'text', value: `#${digits}` }],
    });
    consumed = match.index + whole.length;
  }

  if (out.length === 0) return [{ type: 'text', value }];
  if (consumed < value.length) out.push({ type: 'text', value: value.slice(consumed) });
  return out;
}

/**
 * Descend, replacing text nodes with their linked form.
 *
 * Two shapes are skipped, and they are the two that made this a plugin rather
 * than a regex over the source string. A `link` is not entered at all, so an
 * already-linked `[#242](…/pull/242)` is left alone instead of growing a link
 * inside a link. `inlineCode` and `code` never appear here because their content
 * is a leaf `value`, not child text — which is exactly why `` `Closes #12` ``
 * survives untouched.
 */
function linkReferences(node: MdNode): void {
  if (!node.children || node.type === 'link' || node.type === 'linkReference') return;

  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && child.value) {
      next.push(...splitReferences(child.value));
      continue;
    }
    linkReferences(child);
    next.push(child);
  }
  node.children = next;
}

/** Autolink `#NNN` the way github.com does when it renders the same body. */
export function remarkReleaseReferences() {
  return (tree: MdNode) => linkReferences(tree);
}

const MAX_HEADING_DEPTH = 6;

function shift(node: MdNode, by: number): void {
  if (node.type === 'heading' && node.depth) {
    node.depth = Math.min(node.depth + by, MAX_HEADING_DEPTH);
  }
  for (const child of node.children ?? []) shift(child, by);
}

/**
 * Push every heading in a body down by one level.
 *
 * The page is `h1` "Changelog" and each release is an `h2`, so a body's own `##`
 * would sit beside the title it belongs to rather than under it. Shifting makes
 * the outline say what the layout shows. `h6` is the floor — HTML has no `h7`,
 * and a body nested that deep has bigger problems than this plugin.
 */
export function remarkShiftHeadings() {
  return (tree: MdNode) => shift(tree, 1);
}
