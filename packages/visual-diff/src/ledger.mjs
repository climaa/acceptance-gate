// @ts-check
//
// The token ledger's pure core: a measured spacing value and the CSS that set it in,
// a reading out — the design token it is, or the one it is nearest to.
//
// No browser, no filesystem, no clock. `capture.mjs` stays the only module that touches
// a page; everything here takes plain data, so every rule a reader is shown can be
// pinned by a unit test that never renders anything.
//
// It names spacing; it never judges it. A reading is reference beside a comparison,
// the way a design board is: it carries no bucket and moves no exit code. "Off-scale"
// describes a value, and the differ still detects change, not correctness.

import { LEDGER } from './policy.mjs';

/** @typedef {'token' | 'raw-on-scale' | 'off-scale' | 'exempt' | 'none'} Classification */
/** @typedef {Readonly<Record<string, number>>} Scale */
/** @typedef {typeof LEDGER} LedgerPolicy */

/** One measured property of one element, before it is named.
 *  @typedef {object} Measured
 *  @property {number} px The computed value, in CSS px.
 *  @property {string | null} authored The text that set it, or null when unknown.
 *  @property {string} origin `regular`, `user-agent`, `inline` or `unknown`. Shown,
 *    never classified on: a browser default is judged by its value like anything else.
 *  @property {string | null} anchor The element's `ds-*` class, when it has one.
 *  @property {string} property One of {@link LEDGER}'s properties. */

/** @typedef {{ classification: Classification, token: string | null, reason?: string }} Classified */

/** @typedef {object} Reading
 *  @property {string} property
 *  @property {number} px
 *  @property {string | null} authored
 *  @property {string} origin
 *  @property {string | null} token
 *  @property {Classification} classification
 *  @property {string} [reason] */

/** @typedef {object} LedgerElement
 *  @property {string} path
 *  @property {string} label
 *  @property {readonly number[]} rect `[x, y, width, height]`, in CSS px.
 *  @property {readonly Reading[]} readings */

/** @typedef {object} Ledger
 *  @property {1} schema
 *  @property {string} key
 *  @property {'target' | 'document'} origin What `rect` is measured from.
 *  @property {Scale} scale
 *  @property {readonly LedgerElement[]} elements */

/** A `CSS.getMatchedStylesForNode` payload, narrowed to what the cascade below reads.
 *  @typedef {{ name: string, value?: string, important?: boolean, disabled?: boolean,
 *    parsedOk?: boolean }} CdpProperty */
/** @typedef {{ cssProperties?: readonly CdpProperty[] }} CdpStyle */
/** @typedef {{ inlineStyle?: CdpStyle,
 *    matchedCSSRules?: readonly { rule: { origin: string, style: CdpStyle } }[] }} MatchedStyles */

/** The scale's steps, smallest first. Ties on value keep name order, so the same scale
 *  always walks the same way.
 *  @param {Scale} scale @returns {[string, number][]} */
function stepsOf(scale) {
  return Object.entries(scale).sort(
    ([nameA, a], [nameB, b]) => a - b || (nameA < nameB ? -1 : nameA > nameB ? 1 : 0),
  );
}

/** The step a value sits closest to — never one the scale does not have: with no
 *  `--space-7`, 28px is named against `--space-6`, not invented a step.
 *  @param {number} px @param {Scale} scale
 *  @param {LedgerPolicy['nearestTie']} [tie]
 *  @returns {string | null} null for an empty scale. */
export function nearestStep(px, scale, tie = LEDGER.nearestTie) {
  /** @type {[string, number] | null} */
  let best = null;

  for (const step of stepsOf(scale)) {
    const distance = Math.abs(step[1] - px);
    const bestDistance = best === null ? Infinity : Math.abs(best[1] - px);
    // Smallest first, so a strict comparison keeps the lower of two equal distances.
    if (distance < bestDistance || (tie === 'upper' && distance === bestDistance)) {
      best = step;
    }
  }

  return best === null ? null : best[0];
}

/** The step a value lands on, within the policy's tolerance.
 *  @param {number} px @param {Scale} scale @param {number} tolerance
 *  @returns {string | null} */
function stepAt(px, scale, tolerance) {
  const hit = stepsOf(scale).find(([, value]) => Math.abs(value - px) <= tolerance);

  return hit === undefined ? null : hit[0];
}

/** @param {string} text @returns {string} */
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether authored text is written in a unit that depends on its context. A unit
 *  only counts straight after a number, so `rem` — the scale's own unit — never reads
 *  as `em`; and custom property names are dropped first, so a `--space-2em` is a
 *  name rather than two ems.
 *  @param {string} text @param {readonly string[]} units @returns {boolean} */
function isRelative(text, units) {
  const pattern = new RegExp(`\\d(?:${units.map(escapeRegExp).join('|')})(?![a-z])`, 'i');

  return pattern.test(text.replace(/--[\w-]+/g, ''));
}

/** Whether authored text reads its value through `step`'s custom property.
 *  @param {string} text @param {string} step @returns {boolean} */
function namesStep(text, step) {
  return new RegExp(`var\\(\\s*${escapeRegExp(step)}\\s*[,)]`).test(text);
}

/** The allowlist entry that covers a value, if one does.
 *  @param {Measured} measured @param {number} px The value as the ledger writes it.
 *  @param {LedgerPolicy} policy */
function exemptionFor({ anchor, property }, px, policy) {
  return policy.exempt.find(
    (entry) =>
      entry.anchor === anchor && entry.px === px && entry.properties.includes(property),
  );
}

/** Name one measured value.
 *
 *  The order is the rule: no spacing, then a context-relative unit, then the
 *  allowlist, then the scale. Only a value set through the step's own custom property
 *  is a `token`; a literal that merely equals a step is `raw-on-scale`, which is the one
 *  case where "should be `--space-N`" is honest.
 *  @param {Measured} measured @param {Scale} scale
 *  @param {LedgerPolicy} [policy]
 *  @returns {Classified} */
export function classify(measured, scale, policy = LEDGER) {
  // Named at the precision the file is written at: a value judged unrounded could be
  // called off-scale and then written as exactly the step it missed.
  const px = rounded(measured.px, policy.decimals);
  const { authored } = measured;
  if (px === 0) return { classification: 'none', token: null };

  if (authored !== null && isRelative(authored, policy.relativeUnits)) {
    return { classification: 'exempt', token: null, reason: 'relative unit' };
  }

  const exemption = exemptionFor(measured, px, policy);
  if (exemption)
    return { classification: 'exempt', token: null, reason: exemption.reason };

  const step = stepAt(px, scale, policy.tolerancePx);
  if (step !== null) {
    const named = authored !== null && namesStep(authored, step);
    return { classification: named ? 'token' : 'raw-on-scale', token: step };
  }

  return {
    classification: 'off-scale',
    token: nearestStep(px, scale, policy.nearestTie),
  };
}

/** Where a measured longhand's value can have been written, as `[declaration, slot,
 *  arity]`: the slot is its position in that declaration's value, the arity the
 *  shorthand's own shape (1 for a longhand). Physical and logical both, because
 *  Chromium's user-agent sheet sets a button's padding as `padding-inline-start` and
 *  friends, never as `padding`. Horizontal-tb, left-to-right — the only writing mode
 *  this design system has.
 *  @type {Readonly<Record<string, readonly (readonly [string, number, number])[]>>} */
const SOURCES = {
  'padding-top': [
    ['padding-top', 0, 1],
    ['padding-block-start', 0, 1],
    ['padding-block', 0, 2],
    ['padding', 0, 4],
  ],
  'padding-right': [
    ['padding-right', 0, 1],
    ['padding-inline-end', 0, 1],
    ['padding-inline', 1, 2],
    ['padding', 1, 4],
  ],
  'padding-bottom': [
    ['padding-bottom', 0, 1],
    ['padding-block-end', 0, 1],
    ['padding-block', 1, 2],
    ['padding', 2, 4],
  ],
  'padding-left': [
    ['padding-left', 0, 1],
    ['padding-inline-start', 0, 1],
    ['padding-inline', 0, 2],
    ['padding', 3, 4],
  ],
  'row-gap': [
    ['row-gap', 0, 1],
    ['gap', 0, 2],
  ],
  'column-gap': [
    ['column-gap', 0, 1],
    ['gap', 1, 2],
  ],
};

/** A value's parts, split on whitespace outside parentheses: `calc(1px + 2px) 4px` is
 *  two parts, not four.
 *  @param {string} value @returns {string[]} */
function partsOf(value) {
  const parts = [''];
  let depth = 0;

  for (const char of value.trim()) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0 && /\s/.test(char)) {
      if (parts.at(-1) !== '') parts.push('');
    } else {
      parts[parts.length - 1] += char;
    }
  }

  return parts.filter((part) => part !== '');
}

/** Which of a four-value box shorthand's parts each side takes, by how many were
 *  written: one is every side; two are vertical then horizontal; three are top,
 *  horizontal, bottom; four go round from the top. */
const BOX_PARTS = [null, [0, 0, 0, 0], [0, 1, 0, 1], [0, 1, 2, 1], [0, 1, 2, 3]];

/** The text one slot of a declaration's value holds.
 *  @param {string} value @param {number} slot @param {number} arity
 *  @returns {string | undefined} undefined for a value of a shape the slot cannot be in. */
function slotOf(value, slot, arity) {
  const parts = partsOf(value);
  if (arity === 1) return parts.join(' ');
  if (arity === 2)
    return parts.length <= 2 ? parts[Math.min(slot, parts.length - 1)] : undefined;

  const index = BOX_PARTS[parts.length]?.[slot];
  return index === undefined ? undefined : parts[index];
}

/** @typedef {{ text: string, origin: string, rank: readonly number[] }} Candidate */

/** Every declaration in one style that can have set `property`, ranked by where it
 *  sits in the cascade.
 *  @param {CdpStyle | undefined} style @param {string} origin @param {number} order
 *  @param {string} property @returns {Candidate[]} */
function candidatesIn(style, origin, order, property) {
  // Own keys only: `toString` is not a property this ledger measures, whatever every
  // object inherits under that name.
  const sources = (Object.hasOwn(SOURCES, property) && SOURCES[property]) || [];

  return (style?.cssProperties ?? []).flatMap((declaration, index) => {
    const source = sources.find(([name]) => name === declaration.name);
    // An empty value is what Chromium reports for each longhand of a shorthand that
    // holds a `var()`: the substitution is pending, so the text lives on the shorthand.
    const value = declaration.value?.trim();
    if (!source || !value || declaration.disabled || declaration.parsedOk === false) {
      return [];
    }

    const text = slotOf(value.replace(/\s*!important$/i, ''), source[1], source[2]);
    if (text === undefined) return [];

    const important = declaration.important ? 1 : 0;
    const inline = origin === 'inline' ? 1 : 0;
    return [{ text, origin, rank: [important, inline, order, index] }];
  });
}

/** @param {readonly number[]} a @param {readonly number[]} b @returns {number} */
function compareRanks(a, b) {
  for (let index = 0; index < a.length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** The text that set `property`, and where it was written, from a node's matched
 *  styles.
 *
 *  The cascade, as far as a design system needs it: `!important` beats everything,
 *  then an inline style beats a rule, then a later rule beats an earlier one and a
 *  later declaration beats an earlier one in the same rule. A shorthand stands in for
 *  its longhand, by position.
 *  @param {MatchedStyles} matched @param {string} property
 *  @returns {{ text: string | null, origin: string }} */
export function winningDeclaration(matched, property) {
  const candidates = [
    ...(matched.matchedCSSRules ?? []).flatMap(({ rule }, order) =>
      candidatesIn(rule.style, rule.origin, order, property),
    ),
    ...candidatesIn(matched.inlineStyle, 'inline', Infinity, property),
  ];
  if (candidates.length === 0) return { text: null, origin: 'unknown' };

  const winner = candidates.reduce((best, next) =>
    compareRanks(next.rank, best.rank) >= 0 ? next : best,
  );
  return { text: winner.text, origin: winner.origin };
}

/** @param {number} value @param {number} decimals @returns {number} */
function rounded(value, decimals) {
  const factor = 10 ** decimals;
  // `|| 0` folds -0 into 0: the two print differently and mean the same thing. It
  // also folds NaN, which is what an unset gap measures as (`normal`): no spacing.
  return Math.round(value * factor) / factor || 0;
}

/** @param {Reading} reading @param {number} decimals */
function readingOut(reading, decimals) {
  const out = {
    property: reading.property,
    px: rounded(reading.px, decimals),
    authored: reading.authored,
    origin: reading.origin,
    token: reading.token,
    classification: reading.classification,
  };

  return reading.reason === undefined ? out : { ...out, reason: reading.reason };
}

/** @param {LedgerElement} element @param {LedgerPolicy} policy */
function elementOut(element, policy) {
  const order = (/** @type {Reading} */ reading) =>
    policy.properties.indexOf(reading.property);

  return {
    path: element.path,
    label: element.label,
    rect: element.rect.map((value) => rounded(value, policy.decimals)),
    readings: [...element.readings]
      .sort((a, b) => order(a) - order(b))
      .map((reading) => readingOut(reading, policy.decimals)),
  };
}

/** A ledger as the bytes a file holds: the same ledger is always the same bytes.
 *
 *  Each object is rebuilt field by field in a fixed order, never copied, so nothing
 *  a caller attached — a CDP node id, a stylesheet address, a timestamp — can reach the
 *  file, and the key order a caller happened to build in cannot reach it either.
 *  Elements keep the order they came in: that is document order, and it is the order
 *  a reader walks.
 *  @param {Ledger} ledger @param {LedgerPolicy} [policy] @returns {string} */
export function serializeLedger(ledger, policy = LEDGER) {
  const out = {
    schema: ledger.schema,
    key: ledger.key,
    origin: ledger.origin,
    scale: Object.fromEntries(
      stepsOf(ledger.scale).map(([name, value]) => [
        name,
        rounded(value, policy.decimals),
      ]),
    ),
    elements: ledger.elements.map((element) => elementOut(element, policy)),
  };

  return `${JSON.stringify(out, null, 2)}\n`;
}

/* ---- The in-page walk ------------------------------------------------------ */

/** The walk a capture runs inside the story, as source: a function of
 *  `{ target, fullPage, properties, scalePrefix }`, written as a string for the same
 *  reason `capture.mjs`'s other expressions are — it executes in the page, not here, so
 *  nothing it reads may be a closure over this module. {@link ledgerExpression} calls it.
 *
 *  It returns plain data and leaves one mark: each element it records is stamped
 *  `data-vd-ledger="<index>"`, so the CDP pass can find exactly those nodes. That is why
 *  it runs after the shot and after axe, never before either.
 *
 *  - The scale is read off the live root: every custom property with the prefix,
 *    resolved to px through a probe. tokens.css is never parsed.
 *  - A full-page story walks `body`, because a dialog portals itself out of the
 *    target. Storybook's chrome is skipped by walking up to `body` and no further:
 *    `body` itself carries `sb-show-main`, so a check that reached it would skip all.
 *  - An element is kept when it is drawn and is an anchor (a `ds-*` block class, an
 *    explicit role, or a natively semantic tag) or measures any spacing at all.
 *  - A `normal` gap parses to NaN and is kept as 0: no gap was set.
 *  - Inline text is read per longhand, falling back to a single-valued shorthand —
 *    Stack's `gap: var(--space-N)`. A many-valued inline shorthand is left to the
 *    cascade, which knows its slots. */
export const LEDGER_EXPRESSION = `({ target, fullPage, properties, scalePrefix }) => {
  const root = fullPage ? document.body : document.querySelector(target);
  if (!root) return { scale: {}, elements: [] };

  const scale = {};
  const rootStyle = getComputedStyle(document.documentElement);
  for (let index = 0; index < rootStyle.length; index += 1) {
    const name = rootStyle[index];
    if (!name.startsWith(scalePrefix)) continue;
    const probe = document.createElement('div');
    probe.style.width = 'var(' + name + ')';
    document.body.appendChild(probe);
    scale[name] = parseFloat(getComputedStyle(probe).width);
    probe.remove();
  }

  const SEMANTIC = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|DIALOG|H[1-6]|NAV|MAIN|UL|OL|LI|TABLE|IMG)$/;
  const blockClass = (element) =>
    [...element.classList].find((name) => name.startsWith('ds-') && !name.includes('--')) ?? null;
  const isAnchor = (element) =>
    blockClass(element) !== null || element.hasAttribute('role') || SEMANTIC.test(element.tagName);
  const isChrome = (element) => {
    for (let at = element; at && at !== document.body; at = at.parentElement) {
      if (/^(SCRIPT|STYLE|LINK)$/.test(at.tagName)) return true;
      if (at.id.startsWith('storybook-') && at.id !== 'storybook-root') return true;
      if ([...at.classList].some((name) => name.startsWith('sb-'))) return true;
    }
    return false;
  };
  const isDrawn = (element, style) => {
    const box = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && box.width * box.height > 1;
  };
  const segmentOf = (element) => blockClass(element) ?? element.tagName.toLowerCase();
  const numbered = (element) => {
    const segment = segmentOf(element);
    const twins = element.parentElement
      ? [...element.parentElement.children].filter((sibling) => segmentOf(sibling) === segment)
      : [element];
    return twins.length > 1 ? segment + ':' + (twins.indexOf(element) + 1) : segment;
  };
  const pathOf = (element) => {
    const segments = [numbered(element)];
    for (let at = element.parentElement; at && at !== root; at = at.parentElement) {
      if (isAnchor(at)) segments.unshift(numbered(at));
    }
    return segments.join('/');
  };
  const SHORTHAND = (property) => (property.endsWith('gap') ? 'gap' : 'padding');
  const singleValued = (text) => text !== '' && !/\\s/.test(text.replace(/\\([^)]*\\)/g, ''));
  const inlineOf = (element, property) => {
    const longhand = element.style.getPropertyValue(property);
    if (longhand) return longhand;
    const shorthand = element.style.getPropertyValue(SHORTHAND(property));
    return singleValued(shorthand) ? shorthand : null;
  };
  const base = fullPage ? { x: -scrollX, y: -scrollY } : root.getBoundingClientRect();
  const round = (value) => Math.round(value * 100) / 100;

  const elements = [];
  for (const element of root.querySelectorAll('*')) {
    if (isChrome(element)) continue;
    const style = getComputedStyle(element);
    if (!isDrawn(element, style)) continue;
    const px = properties.map((property) => parseFloat(style.getPropertyValue(property)) || 0);
    if (!isAnchor(element) && px.every((value) => value === 0)) continue;

    const box = element.getBoundingClientRect();
    element.setAttribute('data-vd-ledger', String(elements.length));
    elements.push({
      path: pathOf(element),
      anchor: blockClass(element),
      rect: [round(box.x - base.x), round(box.y - base.y), round(box.width), round(box.height)],
      px,
      inline: properties.map((property) => inlineOf(element, property)),
    });
  }

  return { scale, elements };
}`;

/** The walk as an expression `page.evaluate` takes: {@link LEDGER_EXPRESSION} called
 *  with its arguments inlined as JSON, so nothing crosses into the page but data.
 *  @param {{ target: string, fullPage: boolean, properties: readonly string[],
 *    scalePrefix: string }} args
 *  @returns {string} */
export function ledgerExpression(args) {
  return `(${LEDGER_EXPRESSION})(${JSON.stringify(args)})`;
}

/** One element as the walk returns it.
 *  @typedef {{ path: string, anchor: string | null, rect: readonly number[],
 *    px: readonly number[], inline: readonly (string | null)[] }} WalkedElement */

/** What the CDP pass learned about one stamped node.
 *  @typedef {{ matched: MatchedStyles, ax: { role: string, name: string } }} TracedNode */

/** The role and accessible name of the node a partial accessibility tree describes.
 *  @param {{ nodes?: readonly { ignored?: boolean, role?: { value?: unknown },
 *    name?: { value?: unknown } }[] }} tree
 *  @returns {{ role: string, name: string }} */
export function axOf(tree) {
  const nodes = tree.nodes ?? [];
  const found = nodes.find((candidate) => !candidate.ignored) ?? nodes[0];

  return {
    role: String(found?.role?.value ?? ''),
    name: String(found?.name?.value ?? '').trim(),
  };
}

/** Roles that name nothing a reader could find on the screen. */
const UNNAMED_ROLES = new Set(['', 'none', 'generic', 'presentation']);

/** The last segment of a walked path — the element's own, without its anchors.
 *  @param {string} path @returns {string} */
const segmentOf = (path) => path.split('/').at(-1) ?? path;

/** How a reader finds an element: `role "name"`, as the accessibility tree has it.
 *  An element with no name is labelled by its last path segment, and a role that
 *  says nothing is replaced by that segment — never a bare `none` or `generic`.
 *  @param {{ role: string, name: string } | null} ax @param {string} path
 *  @returns {string} */
export function labelOf(ax, path) {
  const segment = segmentOf(path);
  if (!ax?.name) return segment;

  const role = UNNAMED_ROLES.has(ax.role) ? segment : ax.role;
  return `${role} "${ax.name}"`;
}

/** One reading: the cascade's answer when the trace reached the node, the inline text
 *  when it did not, and `unknown` when neither says who wrote the value.
 *  @param {WalkedElement} element @param {number} index @param {TracedNode | null} traced
 *  @param {Scale} scale @param {LedgerPolicy} policy @returns {Reading} */
function readingOf(element, index, traced, scale, policy) {
  const property = policy.properties[index] ?? '';
  const declaration = traced ? winningDeclaration(traced.matched, property) : null;
  const inline = element.inline[index] ?? null;
  const authored = declaration?.text ?? inline;
  const origin = declaration?.text ? declaration.origin : inline ? 'inline' : 'unknown';
  const px = element.px[index] ?? 0;

  const named = classify(
    { px, authored, origin, anchor: element.anchor, property },
    scale,
    policy,
  );
  return { property, px, authored, origin, ...named };
}

/** A variant's ledger, from what the walk measured and what the trace learned. The
 *  trace answers in the walk's own order and may stop short of it — the budget — so an
 *  element past its end is read from the page alone.
 *  @param {{ key: string, fullPage: boolean,
 *    collected: { scale: Scale, elements: readonly WalkedElement[] },
 *    traced: readonly TracedNode[], policy?: LedgerPolicy }} input
 *  @returns {Ledger} */
export function buildLedger({ key, fullPage, collected, traced, policy = LEDGER }) {
  const elements = collected.elements.map((element, at) => {
    const node = traced[at] ?? null;

    return {
      path: element.path,
      label: labelOf(node?.ax ?? null, element.path),
      rect: element.rect,
      readings: policy.properties.map((_, index) =>
        readingOf(element, index, node, collected.scale, policy),
      ),
    };
  });

  return {
    schema: 1,
    key,
    origin: fullPage ? 'document' : 'target',
    scale: collected.scale,
    elements,
  };
}

/** The sidecar a ledger is written as, beside its screenshot.
 *  @param {Ledger} ledger @param {LedgerPolicy} [policy]
 *  @returns {{ name: string, text: string }} */
export function ledgerFile(ledger, policy = LEDGER) {
  return {
    name: `${ledger.key}${policy.fileSuffix}`,
    text: serializeLedger(ledger, policy),
  };
}

/* ---- Before against after -------------------------------------------------- */

/** What one element's spacing did between two captures: it moved, or the element
 *  itself arrived or left, or — with only one side to read — this is simply what it
 *  measures.
 *  @typedef {'changed' | 'appeared' | 'gone' | 'present'} ChangeKind */

/** One side of a change: a reading trimmed to the value, what names it and where it
 *  was written. The authored text is left behind — the panel shows a token, and the
 *  CSS that set it is the sidecar's business.
 *  @typedef {{ px: number, token: string | null, origin: string,
 *    classification: Classification }} ChangeSide */

/** @typedef {object} LedgerChange
 *  @property {string} label
 *  @property {string} property
 *  @property {ChangeKind} change
 *  @property {ChangeSide | null} before
 *  @property {ChangeSide | null} after
 *  @property {readonly number[] | null} rect The after rect, or null when gone. */

/** @typedef {object} LedgerReport
 *  @property {string} key
 *  @property {'changed' | 'after-only' | null} mode
 *  @property {'target' | 'document'} origin
 *  @property {readonly LedgerChange[]} changes */

/** How an element is paired across two captures: by the name the accessibility tree
 *  gave it, when it has one and no sibling answers to it too; by its path otherwise.
 *
 *  A name survives what a path does not — losing a `ds-*` class moves `ds-btn:2` to
 *  `button:2` while the button is still the one reading "Keep it open" — so the name
 *  leads. `labelOf` falls back to the last path segment for an element with no name,
 *  which is why a label that IS that segment counts as no name at all; and a name two
 *  elements share pairs neither, since nothing would say which is which.
 *  @param {LedgerElement} element @param {readonly LedgerElement[]} siblings
 *  @returns {string} */
export function pairKey(element, siblings) {
  if (element.label === segmentOf(element.path)) return element.path;

  const twins = siblings.filter((other) => other.label === element.label);
  return twins.length <= 1 ? element.label : element.path;
}

/** @param {LedgerElement} element @param {string} property
 *  @returns {Reading | undefined} */
const readingAt = (element, property) =>
  element.readings.find((reading) => reading.property === property);

/** @param {Reading | undefined} reading @param {number} decimals
 *  @returns {ChangeSide | null} */
function sideOf(reading, decimals) {
  if (reading === undefined) return null;

  return {
    // Compared at the precision the file is written at, for the reason `classify`
    // rounds first: 15.999 against 16 is not a change a reader could ever see.
    px: rounded(reading.px, decimals),
    token: reading.token,
    origin: reading.origin,
    classification: reading.classification,
  };
}

/** The classifications an after-only report keeps: the two that say a value is not
 *  the design token it could be. A `token` reading is the system working, and
 *  `exempt` and `none` are nothing to show. */
const AFTER_ONLY = new Set(['off-scale', 'raw-on-scale']);

/** Every property one paired element disagrees on. Reported when the value, the
 *  token or the classification moved — the last alone catches a design token swapped
 *  for the literal it equals, which moves no pixel and names the same nearest step.
 *  A reading the other side classified `none` is a value falling to zero, which is
 *  that property changing rather than the element going away.
 *  @param {LedgerElement} before @param {LedgerElement} after @param {LedgerPolicy} policy
 *  @returns {LedgerChange[]} */
function changesBetween(before, after, policy) {
  return policy.properties.flatMap((property) => {
    const sides = {
      before: sideOf(readingAt(before, property), policy.decimals),
      after: sideOf(readingAt(after, property), policy.decimals),
    };
    if (!sides.before && !sides.after) return [];

    const same =
      sides.before?.px === sides.after?.px &&
      sides.before?.token === sides.after?.token &&
      sides.before?.classification === sides.after?.classification;
    if (same) return [];

    return [
      { label: after.label, property, change: 'changed', ...sides, rect: after.rect },
    ];
  });
}

/** One side's element as changes: everything it measures for an element that arrived
 *  or left, and only what is not a design token when there is no other side to
 *  compare against.
 *  @param {LedgerElement} element @param {'appeared' | 'gone' | 'present'} change
 *  @param {LedgerPolicy} policy @returns {LedgerChange[]} */
function changesOf(element, change, policy) {
  const gone = change === 'gone';
  const keep = (/** @type {Reading} */ reading) =>
    change === 'present'
      ? AFTER_ONLY.has(reading.classification)
      : reading.classification !== 'none';

  return policy.properties.flatMap((property) => {
    const reading = readingAt(element, property);
    if (reading === undefined || !keep(reading)) return [];

    const side = sideOf(reading, policy.decimals);
    return [
      {
        label: element.label,
        property,
        change,
        before: gone ? side : null,
        after: gone ? null : side,
        rect: gone ? null : element.rect,
      },
    ];
  });
}

/** What the spacing did between two captures of one variant.
 *
 *  `baselines` carries no ledgers by construction, so a compare against the corpus
 *  has one side to read and answers `after-only`: which values are not design tokens,
 *  and nothing about what moved. A before side alone is a variant the after capture no
 *  longer has, and there is no after screenshot to show a panel beside.
 *
 *  Order is the reader's: after-side document order, then whatever the before side
 *  lost, then each element's properties as the policy lists them.
 *  @param {Ledger | null | undefined} before @param {Ledger | null | undefined} after
 *  @param {LedgerPolicy} [policy] @returns {{ mode: 'changed' | 'after-only' | null,
 *    changes: LedgerChange[] }} */
export function pairLedgers(before, after, policy = LEDGER) {
  if (!after) return { mode: null, changes: [] };
  if (!before) {
    return {
      mode: 'after-only',
      changes: after.elements.flatMap((element) => changesOf(element, 'present', policy)),
    };
  }

  const keyed = new Map(
    before.elements.map((element) => [pairKey(element, before.elements), element]),
  );
  const paired = new Set();

  const moved = after.elements.flatMap((element) => {
    const key = pairKey(element, after.elements);
    const twin = keyed.get(key);
    if (twin === undefined) return changesOf(element, 'appeared', policy);

    paired.add(key);
    return changesBetween(twin, element, policy);
  });

  const lost = before.elements.flatMap((element) =>
    paired.has(pairKey(element, before.elements))
      ? []
      : changesOf(element, 'gone', policy),
  );

  return { mode: 'changed', changes: [...moved, ...lost] };
}

/** @param {ChangeSide | null} side @param {number} decimals */
const sideOut = (side, decimals) =>
  side === null
    ? null
    : {
        px: rounded(side.px, decimals),
        token: side.token,
        origin: side.origin,
        classification: side.classification,
      };

/** @param {LedgerChange} change @param {number} decimals */
const changeOut = (change, decimals) => ({
  label: change.label,
  property: change.property,
  change: change.change,
  before: sideOut(change.before, decimals),
  after: sideOut(change.after, decimals),
  rect:
    change.rect === null ? null : change.rect.map((value) => rounded(value, decimals)),
});

/** A report as the bytes a file holds, on `serializeLedger`'s terms: every object
 *  rebuilt field by field in a fixed order, so the same report is always the same
 *  bytes whatever a caller attached or whichever order it built its keys in.
 *  @param {LedgerReport} report @param {LedgerPolicy} [policy] @returns {string} */
export function serializeLedgerReport(report, policy = LEDGER) {
  const out = {
    schema: 1,
    key: report.key,
    mode: report.mode,
    origin: report.origin,
    changes: report.changes.map((change) => changeOut(change, policy.decimals)),
  };

  return `${JSON.stringify(out, null, 2)}\n`;
}

/* ---- Light against dark ---------------------------------------------------- */

/** @typedef {{ tier: string, viewport: string, theme: string, id: string,
 *    ledger?: Ledger | null }} LedgerShot */

/** The first reading two ledgers disagree on, as words; null when they agree.
 *  Rects are not compared: a theme may move a box (the toggle's knob does) without
 *  changing any spacing.
 *  @param {Ledger} light @param {Ledger} dark @returns {string | null} */
function firstDifference(light, dark) {
  if (light.elements.length !== dark.elements.length) {
    return `light measured ${light.elements.length} element(s), dark ${dark.elements.length}`;
  }

  for (const [at, element] of light.elements.entries()) {
    const other = dark.elements[at];
    const differs = element.readings.find((reading, index) => {
      const twin = other?.readings[index];
      return (
        twin?.px !== reading.px ||
        twin.token !== reading.token ||
        twin.classification !== reading.classification
      );
    });
    if (differs) {
      const twin = other?.readings.find(
        (reading) => reading.property === differs.property,
      );
      return `light and dark spacing differ at ${element.label} ${differs.property} (${differs.px}px light, ${twin?.px}px dark)`;
    }
  }

  return null;
}

/** Every story whose light and dark ledgers read different spacing. A theme changes
 *  colour, never spacing, so a difference here is worth a line in the log — and only a
 *  line: it decides nothing.
 *  @param {readonly LedgerShot[]} shots @returns {string[]} */
export function themeDrift(shots) {
  const lights = new Map(
    shots
      .filter((shot) => shot.theme === 'light' && shot.ledger)
      .map((shot) => [`${shot.tier}/${shot.viewport}/${shot.id}`, shot]),
  );

  return shots.flatMap((dark) => {
    const light = lights.get(`${dark.tier}/${dark.viewport}/${dark.id}`);
    if (dark.theme !== 'dark' || !dark.ledger || !light?.ledger) return [];

    const difference = firstDifference(light.ledger, dark.ledger);
    return difference ? [`${dark.id} ${dark.viewport}: ${difference}`] : [];
  });
}
