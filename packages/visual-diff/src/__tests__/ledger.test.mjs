import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { LEDGER } from '../policy.mjs';
import {
  axOf,
  buildLedger,
  classify,
  labelOf,
  ledgerExpression,
  ledgerFile,
  nearestStep,
  pairKey,
  pairLedgers,
  serializeLedger,
  serializeLedgerReport,
  themeDrift,
  winningDeclaration,
} from '../ledger.mjs';

/** A synthetic scale, shaped like the one a capture reads off the live root: steps are
 *  never parsed from tokens.css here, so no test below can pin how CSS looks. It has the
 *  real scale's holes on purpose — there is no 7, 9, 11 or 14. */
const SCALE = Object.freeze({
  '--space-1': 4,
  '--space-2': 8,
  '--space-3': 12,
  '--space-4': 16,
  '--space-5': 20,
  '--space-6': 24,
  '--space-8': 32,
  '--space-10': 40,
  '--space-12': 48,
  '--space-16': 64,
});

/** One measured property, defaulting to an author rule on an unremarkable element.
 *  @param {Partial<import('../ledger.mjs').Measured>} overrides */
const measured = (overrides) => ({
  px: 16,
  authored: null,
  origin: 'regular',
  anchor: 'ds-card',
  property: 'padding-top',
  ...overrides,
});

/** A recorded `CSS.getMatchedStylesForNode` payload, trimmed to the padding and gap
 *  declarations. Captured from the Dialog story in the spike, not hand-written: the
 *  shapes Chromium really returns are the point of these two. */
const recorded = (name) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/cdp/${name}.json`, import.meta.url), 'utf8'),
  );

/** A payload with one author rule carrying `declarations`, for the cascade cases no
 *  recorded node happens to show. */
const ruleWith = (declarations, origin = 'regular') => ({
  rule: { origin, selectorList: { text: '.x' }, style: { cssProperties: declarations } },
});

const payload = ({ rules = [], inline = [] } = {}) => ({
  inlineStyle: { cssProperties: inline },
  matchedCSSRules: rules,
});

describe('nearestStep', () => {
  it('names the step a value sits closest to', () => {
    const step = nearestStep(17, SCALE);

    expect(step).toBe('--space-4');
  });

  it('breaks a tie towards the lower step', () => {
    const step = nearestStep(18, SCALE);

    expect(step).toBe('--space-4');
  });

  it('never names a step the scale does not have', () => {
    const step = nearestStep(28, SCALE);

    expect(step).toBe('--space-6');
  });

  it('names the top step for a value above the whole scale', () => {
    const step = nearestStep(80, SCALE);

    expect(step).toBe('--space-16');
  });

  it('breaks a tie towards the upper step when the policy asks for that', () => {
    const step = nearestStep(18, SCALE, 'upper');

    expect(step).toBe('--space-5');
  });

  it('has nothing to name against an empty scale', () => {
    const step = nearestStep(16, {});

    expect(step).toBeNull();
  });
});

describe('classify', () => {
  it('reads a value authored through a scale step as that design token', () => {
    const reading = classify(measured({ px: 16, authored: 'var(--space-4)' }), SCALE);

    expect(reading).toEqual({ classification: 'token', token: '--space-4' });
  });

  it('reads a literal that equals a step as raw-on-scale', () => {
    const reading = classify(measured({ px: 16, authored: '16px' }), SCALE);

    expect(reading).toEqual({ classification: 'raw-on-scale', token: '--space-4' });
  });

  it('does not credit a var() of a different step', () => {
    const reading = classify(measured({ px: 16, authored: 'var(--space-3)' }), SCALE);

    expect(reading.classification).toBe('raw-on-scale');
  });

  it('reads a value between steps as off-scale, naming the nearest', () => {
    const reading = classify(measured({ px: 17, authored: '17px' }), SCALE);

    expect(reading).toEqual({ classification: 'off-scale', token: '--space-4' });
  });

  it('holds a sub-pixel value off the scale: a pixel differ does not round one away', () => {
    const reading = classify(measured({ px: 16.5, authored: '16.5px' }), SCALE);

    expect(reading).toEqual({ classification: 'off-scale', token: '--space-4' });
  });

  it('names a value at the precision the ledger writes it, so 15.9999999 is 16', () => {
    const reading = classify(
      measured({ px: 15.9999999, authored: 'var(--space-4)' }),
      SCALE,
    );

    expect(reading).toEqual({ classification: 'token', token: '--space-4' });
  });

  it('never calls off-scale a value the ledger will write as on it', () => {
    const reading = classify(measured({ px: 16.004, authored: 'var(--space-4)' }), SCALE);

    expect(reading.classification).toBe('token');
  });

  it('still holds off the scale a value that rounds to a different number', () => {
    const reading = classify(measured({ px: 16.006, authored: '16.006px' }), SCALE);

    expect(reading).toEqual({ classification: 'off-scale', token: '--space-4' });
  });

  it.each([
    [18, '--space-4'],
    [80, '--space-16'],
    [28, '--space-6'],
  ])('names %spx off the scale against %s', (px, nearest) => {
    const reading = classify(measured({ px, authored: `${px}px` }), SCALE);

    expect(reading).toEqual({ classification: 'off-scale', token: nearest });
  });

  it('reads zero as no spacing, not as a value off the scale', () => {
    const reading = classify(measured({ px: 0, authored: '0' }), SCALE);

    expect(reading).toEqual({ classification: 'none', token: null });
  });

  it('reads a gap that computes to `normal` as no spacing, not as a value off the scale', () => {
    // Chromium computes `row-gap`/`column-gap` as `normal` on every element that sets
    // no gap, so the collector's number for most elements is `parseFloat('normal')`.
    const reading = classify(measured({ px: Number.NaN, authored: null }), SCALE);

    expect(reading).toEqual({ classification: 'none', token: null });
  });

  it.each([['0.35em'], ['2%'], ['1ch'], ['1vw'], ['1vh'], ['calc(100% - 1rem)']])(
    'exempts a value written in a relative unit (%s)',
    (authored) => {
      const reading = classify(measured({ px: 4.9, authored }), SCALE);

      expect(reading).toEqual({
        classification: 'exempt',
        token: null,
        reason: 'relative unit',
      });
    },
  );

  it('does not read a unit inside a custom property’s name as a relative value', () => {
    const reading = classify(measured({ px: 16, authored: 'var(--space-2em)' }), SCALE);

    expect(reading.classification).not.toBe('exempt');
  });

  it('does not read rem as a relative unit: it is the scale’s own unit', () => {
    const reading = classify(measured({ px: 16, authored: '1rem' }), SCALE);

    expect(reading.classification).toBe('raw-on-scale');
  });

  it('exempts an allowlisted half-step with the reason the policy gives', () => {
    const reading = classify(
      measured({ px: 2, authored: '0.125rem', anchor: 'ds-badge' }),
      SCALE,
    );

    expect(reading).toEqual({
      classification: 'exempt',
      token: null,
      reason: 'pill half-step',
    });
  });

  it('holds the same half-step off the scale on an element the allowlist does not name', () => {
    const reading = classify(
      measured({ px: 2, authored: '0.125rem', anchor: 'ds-card' }),
      SCALE,
    );

    expect(reading).toEqual({ classification: 'off-scale', token: '--space-1' });
  });

  it('holds an allowlisted anchor to the properties its entry names', () => {
    const reading = classify(
      measured({
        px: 2,
        authored: '0.125rem',
        anchor: 'ds-badge',
        property: 'padding-left',
      }),
      SCALE,
    );

    expect(reading.classification).toBe('off-scale');
  });

  it('classifies a browser default by its value: 6px is off the scale', () => {
    const reading = classify(
      measured({ px: 6, authored: '6px', origin: 'user-agent' }),
      SCALE,
    );

    expect(reading).toEqual({ classification: 'off-scale', token: '--space-1' });
  });

  it('classifies a browser default by its value: 8px is on it, though no token set it', () => {
    const reading = classify(
      measured({ px: 8, authored: '8px', origin: 'user-agent' }),
      SCALE,
    );

    expect(reading).toEqual({ classification: 'raw-on-scale', token: '--space-2' });
  });

  it('never credits a token when the authored text is unknown', () => {
    const reading = classify(
      measured({ px: 16, authored: null, origin: 'unknown' }),
      SCALE,
    );

    expect(reading).toEqual({ classification: 'raw-on-scale', token: '--space-4' });
  });

  it('reads the exemptions from the policy it is handed, not a copy of its own', () => {
    const policy = { ...LEDGER, exempt: [] };

    const reading = classify(
      measured({ px: 2, authored: '0.125rem', anchor: 'ds-badge' }),
      SCALE,
      policy,
    );

    expect(reading.classification).toBe('off-scale');
  });
});

describe('winningDeclaration', () => {
  it('reads a design-system padding off its shorthand, past the empty var() longhands', () => {
    const matched = recorded('button-design-system');

    const top = winningDeclaration(matched, 'padding-top');
    const right = winningDeclaration(matched, 'padding-right');

    expect(top).toEqual({ text: 'var(--space-2)', origin: 'regular' });
    expect(right).toEqual({ text: 'var(--space-4)', origin: 'regular' });
  });

  it('reads both gaps off a one-value gap shorthand', () => {
    const matched = recorded('button-design-system');

    const rowGap = winningDeclaration(matched, 'row-gap');
    const columnGap = winningDeclaration(matched, 'column-gap');

    expect(rowGap).toEqual({ text: 'var(--space-2)', origin: 'regular' });
    expect(columnGap).toEqual({ text: 'var(--space-2)', origin: 'regular' });
  });

  it('reads a browser default off the logical longhands the user-agent sheet sets', () => {
    const matched = recorded('button-browser-default');

    const top = winningDeclaration(matched, 'padding-top');
    const left = winningDeclaration(matched, 'padding-left');
    const right = winningDeclaration(matched, 'padding-right');

    expect(top).toEqual({ text: '1px', origin: 'user-agent' });
    expect(left).toEqual({ text: '6px', origin: 'user-agent' });
    expect(right).toEqual({ text: '6px', origin: 'user-agent' });
  });

  it('reads a one-value padding-inline for both inline sides', () => {
    const matched = payload({
      rules: [ruleWith([{ name: 'padding-inline', value: '6px' }], 'user-agent')],
    });

    const left = winningDeclaration(matched, 'padding-left');
    const right = winningDeclaration(matched, 'padding-right');

    expect(left).toEqual({ text: '6px', origin: 'user-agent' });
    expect(right).toEqual({ text: '6px', origin: 'user-agent' });
  });

  it('reads a padding-inline shorthand for both inline sides', () => {
    const matched = payload({
      rules: [ruleWith([{ name: 'padding-inline', value: '6px 10px' }], 'user-agent')],
    });

    const left = winningDeclaration(matched, 'padding-left');
    const right = winningDeclaration(matched, 'padding-right');

    expect(left).toEqual({ text: '6px', origin: 'user-agent' });
    expect(right).toEqual({ text: '10px', origin: 'user-agent' });
  });

  it('lets an inline style beat a rule', () => {
    const matched = payload({
      rules: [ruleWith([{ name: 'gap', value: 'var(--space-2)' }])],
      inline: [{ name: 'gap', value: 'var(--space-3)' }],
    });

    const result = winningDeclaration(matched, 'column-gap');

    expect(result).toEqual({ text: 'var(--space-3)', origin: 'inline' });
  });

  it('lets a later rule beat an earlier one', () => {
    const matched = payload({
      rules: [
        ruleWith([{ name: 'padding', value: 'var(--space-2)' }]),
        ruleWith([{ name: 'padding-top', value: 'var(--space-6)' }]),
      ],
    });

    const result = winningDeclaration(matched, 'padding-top');

    expect(result).toEqual({ text: 'var(--space-6)', origin: 'regular' });
  });

  it('lets a later declaration in the same rule beat an earlier one', () => {
    const matched = payload({
      rules: [
        ruleWith([
          { name: 'padding', value: 'var(--space-2)' },
          { name: 'padding-left', value: 'var(--space-5)' },
        ]),
      ],
    });

    const result = winningDeclaration(matched, 'padding-left');

    expect(result).toEqual({ text: 'var(--space-5)', origin: 'regular' });
  });

  it('lets !important beat an inline style', () => {
    const matched = payload({
      rules: [ruleWith([{ name: 'padding-top', value: '9px', important: true }])],
      inline: [{ name: 'padding-top', value: 'var(--space-1)' }],
    });

    const result = winningDeclaration(matched, 'padding-top');

    expect(result).toEqual({ text: '9px', origin: 'regular' });
  });

  it('expands a three-value padding by the box rules', () => {
    const matched = payload({
      rules: [
        ruleWith([
          { name: 'padding', value: 'var(--space-4) var(--space-6) var(--space-8)' },
        ]),
      ],
    });

    const sides = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'].map(
      (property) => winningDeclaration(matched, property).text,
    );

    expect(sides).toEqual([
      'var(--space-4)',
      'var(--space-6)',
      'var(--space-8)',
      'var(--space-6)',
    ]);
  });

  it('expands a one-value padding to every side', () => {
    const matched = payload({
      rules: [ruleWith([{ name: 'padding', value: 'var(--space-8)' }])],
    });

    const sides = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'].map(
      (property) => winningDeclaration(matched, property).text,
    );

    expect(sides).toEqual(Array(4).fill('var(--space-8)'));
  });

  it('keeps a parenthesised part whole when splitting a shorthand', () => {
    const matched = payload({
      rules: [ruleWith([{ name: 'padding', value: 'calc(1px + 2px) var(--space-2)' }])],
    });

    const result = winningDeclaration(matched, 'padding-top');

    expect(result.text).toBe('calc(1px + 2px)');
  });

  it('knows no source for a name it does not measure, even one every object inherits', () => {
    const matched = payload({ rules: [ruleWith([{ name: 'padding', value: '1px' }])] });

    const result = winningDeclaration(matched, 'toString');

    expect(result).toEqual({ text: null, origin: 'unknown' });
  });

  it('reports no source, never a guess, when nothing set the property', () => {
    const matched = payload();

    const result = winningDeclaration(matched, 'padding-top');

    expect(result).toEqual({ text: null, origin: 'unknown' });
  });
});

/** Every object in `value`, rebuilt with its keys in reverse insertion order. A
 *  serializer that read its input's key order would answer differently for this. */
const reversedKeys = (value) => {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, inner]) => [key, reversedKeys(inner)]),
  );
};

describe('serializeLedger', () => {
  /** @returns {import('../ledger.mjs').Ledger} */
  const ledger = () => ({
    schema: 1,
    key: 'organisms__desktop__dark__organisms-dialog--open',
    origin: 'document',
    scale: { '--space-2': 8, '--space-1': 4 },
    elements: [
      {
        path: 'ds-dialog/ds-btn:2',
        label: 'button "Keep it open"',
        rect: [280.27419, 462.906, 106.1904, 30],
        readings: [
          {
            property: 'padding-right',
            px: 6,
            authored: '6px',
            origin: 'user-agent',
            token: '--space-1',
            classification: 'off-scale',
          },
          {
            property: 'padding-top',
            px: 1,
            authored: '1px',
            origin: 'user-agent',
            token: '--space-1',
            classification: 'off-scale',
          },
        ],
      },
    ],
  });

  it('writes the same bytes for the same ledger', () => {
    const first = serializeLedger(ledger());

    const second = serializeLedger(ledger());

    expect(second).toBe(first);
  });

  it('writes the same bytes whatever order the keys arrived in', () => {
    const ordered = serializeLedger(ledger());

    const shuffled = serializeLedger(reversedKeys(ledger()));

    expect(shuffled).toBe(ordered);
  });

  it('rounds every number to the policy’s decimals', () => {
    const text = serializeLedger(ledger());

    expect(JSON.parse(text).elements[0].rect).toEqual([280.27, 462.91, 106.19, 30]);
  });

  it('orders scale steps by value and readings by the policy’s property order', () => {
    const parsed = JSON.parse(serializeLedger(ledger()));

    expect(Object.keys(parsed.scale)).toEqual(['--space-1', '--space-2']);
    expect(parsed.elements[0].readings.map((reading) => reading.property)).toEqual([
      'padding-top',
      'padding-right',
    ]);
  });

  it('ends in a newline', () => {
    const text = serializeLedger(ledger());

    expect(text.endsWith('}\n')).toBe(true);
  });

  it('never writes a node id, a stylesheet id, an address or a time', () => {
    const noisy = ledger();
    Object.assign(noisy.elements[0], {
      nodeId: 42,
      styleSheetId: 'style-sheet-7-1',
      sourceURL: 'http://127.0.0.1:6006/assets/iframe.css',
      capturedAt: '2026-10-14T09:00:00.000Z',
    });

    const text = serializeLedger(noisy);

    expect(text).not.toMatch(/nodeId|styleSheetId|http|\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps an exemption’s reason beside its classification', () => {
    const exempt = ledger();
    exempt.elements[0].readings[0] = {
      property: 'padding-right',
      px: 2,
      authored: '0.125rem',
      origin: 'regular',
      token: null,
      classification: 'exempt',
      reason: 'pill half-step',
    };

    const parsed = JSON.parse(serializeLedger(exempt));

    expect(parsed.elements[0].readings[1]).toMatchObject({
      classification: 'exempt',
      reason: 'pill half-step',
    });
  });
});

/* ---- The in-page walk ------------------------------------------------------ */

/** The scale a fake root carries, as px. */
const ROOT_VARS = Object.freeze({ '--space-2': 8, '--space-4': 16, '--other': 3 });

/** A fake element: just what the walk reads off a real one.
 *  @param {string} tag
 *  @param {{ id?: string, classes?: string[], attrs?: Record<string, string>,
 *    box?: number[], display?: string, visibility?: string,
 *    computed?: Record<string, string>, inline?: Record<string, string> }} [options]
 *  @param {object[]} [children] */
const node = (tag, options = {}, children = []) => {
  const {
    id = '',
    classes = [],
    attrs = {},
    box = [0, 0, 100, 20],
    display = 'block',
    visibility = 'visible',
    computed = {},
    inline = {},
  } = options;
  const element = {
    tagName: tag.toUpperCase(),
    id,
    classList: classes,
    attributes: { ...attrs },
    children,
    parentElement: null,
    display,
    visibility,
    computed,
    style: { getPropertyValue: (name) => inline[name] ?? '' },
    getAttribute: (name) => element.attributes[name] ?? null,
    hasAttribute: (name) => name in element.attributes,
    setAttribute: (name, value) => {
      element.attributes[name] = value;
    },
    getBoundingClientRect: () => ({
      x: box[0],
      y: box[1],
      width: box[2],
      height: box[3],
    }),
    querySelectorAll: () => descendantsOf(element),
  };
  for (const child of children) child.parentElement = element;
  return element;
};

/** @param {any} element @returns {any[]} Document order, the element itself excluded. */
const descendantsOf = (element) =>
  element.children.flatMap((child) => [child, ...descendantsOf(child)]);

/** The globals a page gives the walk: a document, `getComputedStyle` and the scroll.
 *  @param {any} body */
const pageWith = (body) => {
  const documentElement = { tagName: 'HTML' };
  body.parentElement = documentElement;
  const names = Object.keys(ROOT_VARS);
  const rootStyle = Object.assign([...names], { getPropertyValue: () => '' });

  return {
    document: {
      documentElement,
      body: Object.assign(body, { appendChild: () => {} }),
      querySelector: (selector) =>
        descendantsOf(body).find((element) => `#${element.id}` === selector) ?? null,
      createElement: () => ({ isProbe: true, style: {}, remove: () => {} }),
    },
    getComputedStyle: (element) => {
      if (element === documentElement) return rootStyle;
      if (element.isProbe) {
        const name = /var\((.+)\)/.exec(element.style.width)?.[1] ?? '';
        return { width: `${ROOT_VARS[name] ?? 0}px` };
      }
      return {
        display: element.display,
        visibility: element.visibility,
        getPropertyValue: (name) => element.computed[name] ?? '0px',
      };
    },
    scrollX: 0,
    scrollY: 0,
  };
};

/** Run the walk the way a capture does, over `body`. */
const walk = (body, { fullPage = false } = {}) =>
  inPage(
    ledgerExpression({
      target: '#storybook-root',
      fullPage,
      properties: [...LEDGER.properties],
      scalePrefix: LEDGER.scalePrefix,
    }),
    pageWith(body),
  );

/** @param {string} expression @param {object} globals */
const inPage = (expression, globals) =>
  vm.runInContext(expression, vm.createContext(globals));

const PADDED = { 'padding-top': '8px', 'padding-bottom': '8px' };

describe('LEDGER_EXPRESSION', () => {
  it('measures what a story with visible content renders: never an empty walk', () => {
    const body = node('body', {}, [
      node('div', { id: 'storybook-root', box: [10, 10, 200, 40] }, [
        node('button', { box: [20, 15, 80, 30], computed: PADDED }),
      ]),
    ]);

    const { elements } = walk(body);

    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('reads the scale off the live root, every custom property with the prefix', () => {
    const body = node('body', {}, [node('div', { id: 'storybook-root' })]);

    const { scale } = walk(body);

    expect(scale).toEqual({ '--space-2': 8, '--space-4': 16 });
  });

  it('skips boxes that are not drawn: display none, hidden, or with no area', () => {
    const body = node('body', {}, [
      node('div', { id: 'storybook-root' }, [
        node('button', { display: 'none', computed: PADDED }),
        node('button', { visibility: 'hidden', computed: PADDED }),
        node('button', { box: [0, 0, 0, 20], computed: PADDED }),
        node('button', { attrs: { 'aria-label': 'drawn' }, computed: PADDED }),
      ]),
    ]);

    const { elements } = walk(body);

    expect(elements).toHaveLength(1);
  });

  it('walks the body for a full-page story, where a dialog portals itself', () => {
    const body = node('body', { classes: ['sb-show-main'] }, [
      node('div', { id: 'storybook-root' }),
      node('div', {
        classes: ['ds-dialog'],
        attrs: { role: 'dialog' },
        computed: PADDED,
      }),
    ]);

    const { elements } = walk(body, { fullPage: true });

    expect(elements.map((element) => element.path)).toEqual(['ds-dialog']);
  });

  it('skips Storybook’s own chrome, but not the story under a body that carries sb-show-main', () => {
    const body = node('body', { classes: ['sb-show-main'] }, [
      node('div', { classes: ['sb-wrapper'] }, [node('button', { computed: PADDED })]),
      node('div', { id: 'storybook-docs' }, [node('button', { computed: PADDED })]),
      node('div', { id: 'storybook-root' }, [
        node('button', { classes: ['ds-btn'], computed: PADDED }),
      ]),
    ]);

    const { elements } = walk(body, { fullPage: true });

    expect(elements.map((element) => element.path)).toEqual(['ds-btn']);
  });

  it('names a path by its anchors, skipping the wrappers between them', () => {
    const body = node('body', {}, [
      node('div', { id: 'storybook-root' }, [
        node('div', { classes: ['ds-dialog'] }, [
          node('div', {}, [node('button', { classes: ['ds-btn'], computed: PADDED })]),
        ]),
      ]),
    ]);

    const { elements } = walk(body);

    expect(elements.map((element) => element.path)).toEqual([
      'ds-dialog',
      'ds-dialog/ds-btn',
    ]);
  });

  it('numbers siblings that would otherwise share a path', () => {
    const body = node('body', {}, [
      node('div', { id: 'storybook-root' }, [
        node('button', { classes: ['ds-btn'], computed: PADDED }),
        node('button', { classes: ['ds-btn'], computed: PADDED }),
      ]),
    ]);

    const { elements } = walk(body);

    expect(elements.map((element) => element.path)).toEqual(['ds-btn:1', 'ds-btn:2']);
  });

  it('reads the gap Stack writes inline, as the text it wrote', () => {
    const body = node('body', {}, [
      node('div', { id: 'storybook-root' }, [
        node('div', {
          classes: ['ds-stack'],
          computed: { 'row-gap': '8px', 'column-gap': '8px' },
          inline: { gap: 'var(--space-2)' },
        }),
      ]),
    ]);

    const [stack] = walk(body).elements;
    const inline = Object.fromEntries(
      LEDGER.properties.map((property, index) => [property, stack.inline[index]]),
    );

    expect(inline).toMatchObject({
      'row-gap': 'var(--space-2)',
      'column-gap': 'var(--space-2)',
    });
  });

  it('leaves a many-valued inline shorthand to the cascade rather than guess its slot', () => {
    const body = node('body', {}, [
      node('div', { id: 'storybook-root' }, [
        node('div', {
          classes: ['ds-card'],
          computed: PADDED,
          inline: { padding: 'var(--space-2) var(--space-4)' },
        }),
      ]),
    ]);

    const [card] = walk(body).elements;

    expect(card.inline.every((text) => text === null)).toBe(true);
  });

  it('measures an unset gap as no spacing, not as a number it is not', () => {
    const body = node('body', {}, [
      node('div', { id: 'storybook-root' }, [
        node('button', {
          computed: { ...PADDED, 'row-gap': 'normal', 'column-gap': 'normal' },
        }),
      ]),
    ]);

    const [button] = walk(body).elements;

    expect(button.px.slice(4)).toEqual([0, 0]);
  });

  it('places a box relative to the target for an element shot', () => {
    const body = node('body', {}, [
      node('div', { id: 'storybook-root', box: [10, 10, 200, 40] }, [
        node('button', { box: [20, 15, 80, 30], computed: PADDED }),
      ]),
    ]);

    const [button] = walk(body).elements;

    expect(button.rect).toEqual([10, 5, 80, 30]);
  });

  it('stamps each element it records, in the order it records them', () => {
    const first = node('button', { computed: PADDED });
    const second = node('a', { computed: PADDED });
    const body = node('body', {}, [
      node('div', { id: 'storybook-root' }, [first, second]),
    ]);

    walk(body);

    expect(
      [first, second].map((element) => element.getAttribute('data-vd-ledger')),
    ).toEqual(['0', '1']);
  });

  it('keeps no plain wrapper that measures nothing', () => {
    const body = node('body', {}, [
      node('div', { id: 'storybook-root' }, [node('div', {}, [node('span')])]),
    ]);

    const { elements } = walk(body);

    expect(elements).toEqual([]);
  });
});

/* ---- From the walk and the cascade to a ledger ------------------------------ */

/** What the walk returns for one element. */
const walked = (overrides = {}) => ({
  path: 'ds-dialog/ds-btn:2',
  anchor: 'ds-btn',
  rect: [912.5, 455, 131.27, 40],
  px: [8, 16, 8, 16, 8, 8],
  inline: [null, null, null, null, null, null],
  ...overrides,
});

/** An accessibility node as `Accessibility.getPartialAXTree` returns it. */
const axPayload = (role, name) => ({
  nodes: [{ ignored: false, role: { value: role }, name: { value: name } }],
});

const KEEP_IT_OPEN = Object.freeze({
  matched: recorded('button-design-system'),
  ax: { role: 'button', name: 'Keep it open' },
});

const ledgerOf = ({
  elements = [walked()],
  traced = [KEEP_IT_OPEN],
  fullPage = true,
} = {}) =>
  buildLedger({
    key: 'organisms__desktop__dark__organisms-dialog--open',
    fullPage,
    collected: { scale: SCALE, elements },
    traced,
  });

describe('axOf', () => {
  it('reads the role and the name off the node the tree returns', () => {
    const ax = axOf(axPayload('button', 'Keep it open'));

    expect(ax).toEqual({ role: 'button', name: 'Keep it open' });
  });

  it('reads nothing from an empty tree', () => {
    const ax = axOf({ nodes: [] });

    expect(ax).toEqual({ role: '', name: '' });
  });
});

describe('labelOf', () => {
  it('names an element by its role and accessible name', () => {
    const label = labelOf({ role: 'button', name: 'Keep it open' }, 'ds-dialog/ds-btn:2');

    expect(label).toBe('button "Keep it open"');
  });

  it.each([['none'], ['generic'], ['']])(
    'labels an element with no name by its last path segment, never by role "%s"',
    (role) => {
      const label = labelOf({ role, name: '' }, 'ds-dialog/ds-stack:1');

      expect(label).toBe('ds-stack:1');
    },
  );

  it('keeps the name of a generic element, under its segment rather than "generic"', () => {
    const label = labelOf({ role: 'generic', name: 'Totals' }, 'ds-card');

    expect(label).toBe('ds-card "Totals"');
  });
});

describe('buildLedger', () => {
  it('names the dialog’s button by its role and name, every padding a design token', () => {
    const ledger = ledgerOf();

    const [button] = ledger.elements;
    expect({
      label: button?.label,
      padding: button?.readings
        .slice(0, 4)
        .map((reading) => [reading.px, reading.classification]),
      authored: button?.readings.slice(0, 2).map((reading) => reading.authored),
    }).toEqual({
      label: 'button "Keep it open"',
      padding: [
        [8, 'token'],
        [16, 'token'],
        [8, 'token'],
        [16, 'token'],
      ],
      authored: ['var(--space-2)', 'var(--space-4)'],
    });
  });

  it('reads one reading per measured property, in the policy’s order', () => {
    const ledger = ledgerOf();

    expect(ledger.elements[0]?.readings.map((reading) => reading.property)).toEqual([
      ...LEDGER.properties,
    ]);
  });

  it('says where a rect is measured from: the document for a full-page story', () => {
    expect([
      ledgerOf({ fullPage: true }).origin,
      ledgerOf({ fullPage: false }).origin,
    ]).toEqual(['document', 'target']);
  });

  it('falls back to the inline text for an element the trace never reached', () => {
    const stack = walked({
      path: 'ds-stack',
      anchor: 'ds-stack',
      px: [0, 0, 0, 0, 8, 8],
      inline: [null, null, null, null, 'var(--space-2)', 'var(--space-2)'],
    });

    const ledger = ledgerOf({ elements: [stack], traced: [] });

    expect(ledger.elements[0]?.readings[4]).toMatchObject({
      authored: 'var(--space-2)',
      origin: 'inline',
      classification: 'token',
    });
  });

  it('marks what the trace never reached as unknown, and still names its value', () => {
    const ledger = ledgerOf({ elements: [walked()], traced: [] });

    expect(ledger.elements[0]?.readings[1]).toMatchObject({
      authored: null,
      origin: 'unknown',
      token: '--space-4',
      classification: 'raw-on-scale',
    });
  });

  it('labels an element the trace never reached by its path', () => {
    const ledger = ledgerOf({ elements: [walked()], traced: [] });

    expect(ledger.elements[0]?.label).toBe('ds-btn:2');
  });

  it('serializes to the same bytes whatever order the trace answered in', () => {
    const one = serializeLedger(ledgerOf());
    const two = serializeLedger(ledgerOf({ traced: [{ ...KEEP_IT_OPEN }] }));

    expect(one).toBe(two);
  });
});

describe('ledgerFile', () => {
  it('names the sidecar after the screenshot’s variant key', () => {
    const file = ledgerFile(ledgerOf());

    expect(file.name).toBe(
      'organisms__desktop__dark__organisms-dialog--open.ledger.json',
    );
  });

  it('holds the serialized ledger', () => {
    const ledger = ledgerOf();

    expect(ledgerFile(ledger).text).toBe(serializeLedger(ledger));
  });
});

describe('themeDrift', () => {
  /** @param {string} theme @param {object} ledger */
  const shot = (theme, ledger) => ({
    key: `organisms__desktop__${theme}__organisms-dialog--open`,
    tier: 'organisms',
    viewport: 'desktop',
    theme,
    id: 'organisms-dialog--open',
    ledger,
  });

  it('finds nothing when light and dark read the same spacing, wherever the boxes sit', () => {
    const light = ledgerOf();
    const dark = ledgerOf({ elements: [walked({ rect: [900, 400, 131.27, 40] })] });

    const drift = themeDrift([shot('light', light), shot('dark', dark)]);

    expect(drift).toEqual([]);
  });

  it('names the story and the reading where light and dark disagree', () => {
    const light = ledgerOf();
    const dark = ledgerOf({ elements: [walked({ px: [8, 17, 8, 16, 8, 8] })] });

    const drift = themeDrift([shot('light', light), shot('dark', dark)]);

    expect(drift).toEqual([
      'organisms-dialog--open desktop: light and dark spacing differ at button "Keep it open" padding-right (16px light, 17px dark)',
    ]);
  });

  it('names a story whose two themes measured a different number of elements', () => {
    const light = ledgerOf();
    const dark = ledgerOf({
      elements: [walked(), walked({ path: 'ds-btn:3' })],
      traced: [KEEP_IT_OPEN, KEEP_IT_OPEN],
    });

    const drift = themeDrift([shot('light', light), shot('dark', dark)]);

    expect(drift).toEqual([
      'organisms-dialog--open desktop: light measured 1 element(s), dark 2',
    ]);
  });

  it('compares nothing a capture did not record in both themes', () => {
    const drift = themeDrift([shot('light', ledgerOf()), shot('dark', null)]);

    expect(drift).toEqual([]);
  });
});

/* ---- Before against after --------------------------------------------------- */

/** One reading, named as the design token it equals when the scale has one — which
 *  is what `classify` answers for a value written through that token's own custom
 *  property, and the shape every case below starts from. */
const reads = (property, px, overrides = {}) => {
  const step = Object.entries(SCALE).find(([, value]) => value === px);

  return {
    property,
    px,
    authored: step ? `var(${step[0]})` : `${px}px`,
    origin: 'regular',
    token: step?.[0] ?? null,
    classification: step ? 'token' : px === 0 ? 'none' : 'off-scale',
    ...overrides,
  };
};

/** One element of a ledger, carrying only the readings a case is about. */
const element = ({
  path = 'ds-dialog/ds-btn:2',
  label = 'button "Keep it open"',
  rect = [912.5, 455, 131.27, 40],
  readings = [],
}) => ({ path, label, rect, readings });

/** A ledger over the given elements. */
const ledgerAround = (elements, origin = 'document') => ({
  schema: 1,
  key: 'organisms__desktop__dark__organisms-dialog--open',
  origin,
  scale: SCALE,
  elements,
});

/** The dialog's button as the design system styles it, and as the browser does
 *  when the class is gone: the real regression x-visual-diff-pages draws. */
const STYLED = element({
  readings: [
    reads('padding-top', 8),
    reads('padding-right', 16),
    reads('padding-bottom', 8),
    reads('padding-left', 16),
  ],
});
const BARE = element({
  path: 'ds-dialog/button:2',
  readings: [
    reads('padding-top', 1, { origin: 'user-agent', token: '--space-1' }),
    reads('padding-right', 6, { origin: 'user-agent', token: '--space-1' }),
    reads('padding-bottom', 1, { origin: 'user-agent', token: '--space-1' }),
    reads('padding-left', 6, { origin: 'user-agent', token: '--space-1' }),
  ],
});

describe('pairKey', () => {
  it('keys an element by the name the accessibility tree gave it', () => {
    const key = pairKey(STYLED, [STYLED]);

    expect(key).toBe('button "Keep it open"');
  });

  // `labelOf` falls back to the last path segment for an element with no name, so a
  // label that IS that segment is no name at all — and a path pairs it as well as
  // anything can.
  it('falls back to the path for an element the tree never named', () => {
    const stack = element({ path: 'ds-dialog/ds-stack:1', label: 'ds-stack:1' });

    const key = pairKey(stack, [stack]);

    expect(key).toBe('ds-dialog/ds-stack:1');
  });

  // Two elements that answer to one name cannot tell each other apart, so the name
  // is worse than the path: it would pair the first with the second.
  it('falls back to the path for a name two elements share', () => {
    const twin = element({ path: 'ds-dialog/ds-btn:3' });
    const siblings = [STYLED, twin];

    const key = pairKey(twin, siblings);

    expect(key).toBe('ds-dialog/ds-btn:3');
  });
});

describe('pairLedgers', () => {
  it('says nothing about a variant neither set measured', () => {
    const paired = pairLedgers(null, null);

    expect(paired).toEqual({ mode: null, changes: [] });
  });

  // A before side alone is a variant the after capture no longer has. There is
  // nothing to show beside an after screenshot that does not exist.
  it('says nothing when only the before side measured a ledger', () => {
    const paired = pairLedgers(ledgerAround([STYLED]), null);

    expect(paired).toEqual({ mode: null, changes: [] });
  });

  it('reports nothing for a property whose value and token both stayed', () => {
    const paired = pairLedgers(ledgerAround([STYLED]), ledgerAround([STYLED]));

    expect(paired).toEqual({ mode: 'changed', changes: [] });
  });

  // The same 16px and the same nearest step on both sides: only the authoring moved,
  // from the design token to a literal that happens to equal it. That is the
  // "should be --space-4" the readings exist to name, invisible to px and token alone.
  it('reports a token swapped for the literal it equals, though no pixel moved', () => {
    const literal = element({
      readings: [
        reads('padding-right', 16, { authored: '16px', classification: 'raw-on-scale' }),
      ],
    });
    const tokened = element({ readings: [reads('padding-right', 16)] });

    const paired = pairLedgers(ledgerAround([tokened]), ledgerAround([literal]));

    expect(paired.changes).toEqual([
      {
        label: 'button "Keep it open"',
        property: 'padding-right',
        change: 'changed',
        before: {
          px: 16,
          token: '--space-4',
          origin: 'regular',
          classification: 'token',
        },
        after: {
          px: 16,
          token: '--space-4',
          origin: 'regular',
          classification: 'raw-on-scale',
        },
        rect: [912.5, 455, 131.27, 40],
      },
    ]);
  });

  it('reports an off-scale value whose nearest step moved, though its pixels did not', () => {
    const before = element({
      readings: [reads('padding-right', 18, { token: '--space-4' })],
    });
    const after = element({
      readings: [reads('padding-right', 18, { token: '--space-5' })],
    });

    const paired = pairLedgers(ledgerAround([before]), ledgerAround([after]));

    expect(paired.changes.map((change) => change.after?.token)).toEqual(['--space-5']);
  });

  it('reports the dialog’s button falling off the scale, property by property', () => {
    const paired = pairLedgers(ledgerAround([STYLED]), ledgerAround([BARE]));

    expect(paired.changes).toEqual([
      {
        label: 'button "Keep it open"',
        property: 'padding-top',
        change: 'changed',
        before: { px: 8, token: '--space-2', origin: 'regular', classification: 'token' },
        after: {
          px: 1,
          token: '--space-1',
          origin: 'user-agent',
          classification: 'off-scale',
        },
        rect: [912.5, 455, 131.27, 40],
      },
      {
        label: 'button "Keep it open"',
        property: 'padding-right',
        change: 'changed',
        before: {
          px: 16,
          token: '--space-4',
          origin: 'regular',
          classification: 'token',
        },
        after: {
          px: 6,
          token: '--space-1',
          origin: 'user-agent',
          classification: 'off-scale',
        },
        rect: [912.5, 455, 131.27, 40],
      },
      {
        label: 'button "Keep it open"',
        property: 'padding-bottom',
        change: 'changed',
        before: { px: 8, token: '--space-2', origin: 'regular', classification: 'token' },
        after: {
          px: 1,
          token: '--space-1',
          origin: 'user-agent',
          classification: 'off-scale',
        },
        rect: [912.5, 455, 131.27, 40],
      },
      {
        label: 'button "Keep it open"',
        property: 'padding-left',
        change: 'changed',
        before: {
          px: 16,
          token: '--space-4',
          origin: 'regular',
          classification: 'token',
        },
        after: {
          px: 6,
          token: '--space-1',
          origin: 'user-agent',
          classification: 'off-scale',
        },
        rect: [912.5, 455, 131.27, 40],
      },
    ]);
  });

  // The label pairs them, so the path moving from `ds-btn:2` to `button:2` — which
  // is what losing the class does to the walk — is not a disappearance.
  it('pairs an element whose path moved but whose name did not', () => {
    const paired = pairLedgers(ledgerAround([STYLED]), ledgerAround([BARE]));

    expect(paired.changes.map((change) => change.change)).toEqual([
      'changed',
      'changed',
      'changed',
      'changed',
    ]);
  });

  // A padding that went away is still that element's spacing having changed. Read
  // as `gone`, it would report the whole element as having disappeared.
  it('reports a padding that fell to zero as changed, never as gone', () => {
    const flattened = element({
      readings: [reads('padding-right', 0)],
    });

    const paired = pairLedgers(
      ledgerAround([element({ readings: [reads('padding-right', 16)] })]),
      ledgerAround([flattened]),
    );

    expect(paired.changes).toEqual([
      {
        label: 'button "Keep it open"',
        property: 'padding-right',
        change: 'changed',
        before: {
          px: 16,
          token: '--space-4',
          origin: 'regular',
          classification: 'token',
        },
        after: { px: 0, token: null, origin: 'regular', classification: 'none' },
        rect: [912.5, 455, 131.27, 40],
      },
    ]);
  });

  it('reports an element only the after side has as appeared, with its own rect', () => {
    const paired = pairLedgers(ledgerAround([]), ledgerAround([STYLED]));

    expect(paired.changes).toMatchObject([
      { property: 'padding-top', change: 'appeared', before: null, rect: STYLED.rect },
      { property: 'padding-right', change: 'appeared', before: null },
      { property: 'padding-bottom', change: 'appeared', before: null },
      { property: 'padding-left', change: 'appeared', before: null },
    ]);
  });

  it('reports an element only the before side has as gone, with no rect', () => {
    const paired = pairLedgers(ledgerAround([STYLED]), ledgerAround([]));

    expect(paired.changes).toMatchObject([
      { property: 'padding-top', change: 'gone', after: null, rect: null },
      { property: 'padding-right', change: 'gone', after: null, rect: null },
      { property: 'padding-bottom', change: 'gone', after: null, rect: null },
      { property: 'padding-left', change: 'gone', after: null, rect: null },
    ]);
  });

  // An element that came or went lists the spacing it has, and a property it never
  // set is not spacing it has.
  it('lists no `none` reading for an element that came or went', () => {
    const empty = element({ readings: [reads('row-gap', 0), reads('padding-top', 8)] });

    const paired = pairLedgers(ledgerAround([]), ledgerAround([empty]));

    expect(paired.changes.map((change) => change.property)).toEqual(['padding-top']);
  });

  // The after side is what a reader is looking at, so it leads; a before-only
  // element has nowhere else to go than after everything that is still there.
  it('reads after-side document order first, then what the before side lost', () => {
    const kept = element({ path: 'ds-card', label: 'ds-card' });
    const lost = element({
      path: 'ds-dialog/ds-stack:1',
      label: 'ds-stack:1',
      readings: [reads('row-gap', 8)],
    });
    const added = element({
      path: 'ds-tag',
      label: 'ds-tag',
      readings: [reads('row-gap', 4)],
    });

    const paired = pairLedgers(ledgerAround([kept, lost]), ledgerAround([kept, added]));

    expect(paired.changes.map((change) => [change.label, change.change])).toEqual([
      ['ds-tag', 'appeared'],
      ['ds-stack:1', 'gone'],
    ]);
  });

  it('orders one element’s properties as the policy does', () => {
    const shuffled = element({
      readings: [reads('row-gap', 8), reads('padding-left', 6), reads('padding-top', 6)],
    });

    const paired = pairLedgers(ledgerAround([]), ledgerAround([shuffled]));

    expect(paired.changes.map((change) => change.property)).toEqual([
      'padding-top',
      'padding-left',
      'row-gap',
    ]);
  });

  // `baselines` carries no ledgers by construction, so a compare against the corpus
  // has only one side to read. What it can still say is which spacing is not a
  // design token — and nothing at all about what moved.
  it('keeps only the off-scale and raw-on-scale readings of an after-only capture', () => {
    const mixed = element({
      readings: [
        reads('padding-top', 8),
        reads('padding-right', 6),
        reads('padding-bottom', 16, { authored: '16px', classification: 'raw-on-scale' }),
        reads('padding-left', 0),
        reads('row-gap', 2, { classification: 'exempt', token: null }),
      ],
    });

    const paired = pairLedgers(null, ledgerAround([mixed]));

    expect({
      mode: paired.mode,
      changes: paired.changes.map((change) => [change.property, change.change]),
    }).toEqual({
      mode: 'after-only',
      changes: [
        ['padding-right', 'present'],
        ['padding-bottom', 'present'],
      ],
    });
  });

  it('names the after side of a present reading and leaves the before side empty', () => {
    const paired = pairLedgers(null, ledgerAround([BARE]));

    expect(paired.changes[0]).toEqual({
      label: 'button "Keep it open"',
      property: 'padding-top',
      change: 'present',
      before: null,
      after: {
        px: 1,
        token: '--space-1',
        origin: 'user-agent',
        classification: 'off-scale',
      },
      rect: [912.5, 455, 131.27, 40],
    });
  });
});

describe('serializeLedgerReport', () => {
  const report = () => ({
    key: 'organisms__desktop__dark__organisms-dialog--open',
    mode: 'changed',
    origin: 'document',
    changes: pairLedgers(ledgerAround([STYLED]), ledgerAround([BARE])).changes,
  });

  it('writes the same bytes for the same report', () => {
    const first = serializeLedgerReport(report());

    const second = serializeLedgerReport(report());

    expect(second).toBe(first);
  });

  it('writes the same bytes whatever order the keys arrived in', () => {
    const ordered = serializeLedgerReport(report());

    const shuffled = serializeLedgerReport(reversedKeys(report()));

    expect(shuffled).toBe(ordered);
  });

  it('stamps the schema, the key, the mode and where a rect is measured from', () => {
    const parsed = JSON.parse(serializeLedgerReport(report()));

    expect(parsed).toMatchObject({
      schema: 1,
      key: 'organisms__desktop__dark__organisms-dialog--open',
      mode: 'changed',
      origin: 'document',
    });
  });

  it('rounds every number to the policy’s decimals', () => {
    const one = element({
      rect: [280.27419, 462.906, 106.1904, 30],
      readings: [reads('padding-top', 6.004)],
    });

    const parsed = JSON.parse(
      serializeLedgerReport({
        key: 'k',
        mode: 'after-only',
        origin: 'target',
        changes: pairLedgers(null, ledgerAround([one])).changes,
      }),
    );

    expect(parsed.changes[0]).toMatchObject({
      after: { px: 6 },
      rect: [280.27, 462.91, 106.19, 30],
    });
  });
});
