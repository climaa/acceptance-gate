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

/** @typedef {'token' | 'raw-on-scale' | 'off-scale' | 'exempt' | 'none'} Verdict */
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

/** @typedef {{ verdict: Verdict, token: string | null, reason?: string }} Classification */

/** @typedef {object} Reading
 *  @property {string} property
 *  @property {number} px
 *  @property {string | null} authored
 *  @property {string} origin
 *  @property {string | null} token
 *  @property {Verdict} verdict
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
 *  as `em`.
 *  @param {string} text @param {readonly string[]} units @returns {boolean} */
function isRelative(text, units) {
  const pattern = new RegExp(`\\d(?:${units.map(escapeRegExp).join('|')})(?![a-z])`, 'i');

  return pattern.test(text);
}

/** Whether authored text reads its value through `step`'s custom property.
 *  @param {string} text @param {string} step @returns {boolean} */
function namesStep(text, step) {
  return new RegExp(`var\\(\\s*${escapeRegExp(step)}\\s*[,)]`).test(text);
}

/** The allowlist entry that covers a value, if one does.
 *  @param {Measured} measured @param {LedgerPolicy} policy */
function exemptionFor({ anchor, property, px }, policy) {
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
 *  @returns {Classification} */
export function classify(measured, scale, policy = LEDGER) {
  const { px, authored } = measured;
  if (px === 0) return { verdict: 'none', token: null };

  if (authored !== null && isRelative(authored, policy.relativeUnits)) {
    return { verdict: 'exempt', token: null, reason: 'relative unit' };
  }

  const exemption = exemptionFor(measured, policy);
  if (exemption) return { verdict: 'exempt', token: null, reason: exemption.reason };

  const step = stepAt(px, scale, policy.tolerancePx);
  if (step !== null) {
    const named = authored !== null && namesStep(authored, step);
    return { verdict: named ? 'token' : 'raw-on-scale', token: step };
  }

  return { verdict: 'off-scale', token: nearestStep(px, scale, policy.nearestTie) };
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
  const sources = SOURCES[property] ?? [];

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
  // `|| 0` folds -0 into 0: the two print differently and mean the same thing.
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
    verdict: reading.verdict,
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
