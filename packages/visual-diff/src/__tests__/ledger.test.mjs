import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { LEDGER } from '../policy.mjs';
import {
  classify,
  nearestStep,
  serializeLedger,
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

  it('has nothing to name against an empty scale', () => {
    const step = nearestStep(16, {});

    expect(step).toBeNull();
  });
});

describe('classify', () => {
  it('reads a value authored through a scale step as that token', () => {
    const reading = classify(measured({ px: 16, authored: 'var(--space-4)' }), SCALE);

    expect(reading).toEqual({ verdict: 'token', token: '--space-4' });
  });

  it('reads a literal that equals a step as raw-on-scale', () => {
    const reading = classify(measured({ px: 16, authored: '16px' }), SCALE);

    expect(reading).toEqual({ verdict: 'raw-on-scale', token: '--space-4' });
  });

  it('does not credit a var() of a different step', () => {
    const reading = classify(measured({ px: 16, authored: 'var(--space-3)' }), SCALE);

    expect(reading.verdict).toBe('raw-on-scale');
  });

  it('reads a value between steps as off-scale, naming the nearest', () => {
    const reading = classify(measured({ px: 17, authored: '17px' }), SCALE);

    expect(reading).toEqual({ verdict: 'off-scale', token: '--space-4' });
  });

  it('holds a sub-pixel value off the scale: a pixel differ does not round one away', () => {
    const reading = classify(measured({ px: 16.5, authored: '16.5px' }), SCALE);

    expect(reading).toEqual({ verdict: 'off-scale', token: '--space-4' });
  });

  it('reads zero as no spacing, not as a value off the scale', () => {
    const reading = classify(measured({ px: 0, authored: '0' }), SCALE);

    expect(reading).toEqual({ verdict: 'none', token: null });
  });

  it.each([['0.35em'], ['2%'], ['1ch'], ['1vw'], ['calc(100% - 1rem)']])(
    'exempts a value written in a relative unit (%s)',
    (authored) => {
      const reading = classify(measured({ px: 4.9, authored }), SCALE);

      expect(reading).toEqual({
        verdict: 'exempt',
        token: null,
        reason: 'relative unit',
      });
    },
  );

  it('does not read rem as a relative unit: it is the scale’s own unit', () => {
    const reading = classify(measured({ px: 16, authored: '1rem' }), SCALE);

    expect(reading.verdict).toBe('raw-on-scale');
  });

  it('exempts an allowlisted half-step with the reason the policy gives', () => {
    const reading = classify(
      measured({ px: 2, authored: '0.125rem', anchor: 'ds-badge' }),
      SCALE,
    );

    expect(reading).toEqual({ verdict: 'exempt', token: null, reason: 'pill half-step' });
  });

  it('holds the same half-step off the scale on an element the allowlist does not name', () => {
    const reading = classify(
      measured({ px: 2, authored: '0.125rem', anchor: 'ds-card' }),
      SCALE,
    );

    expect(reading).toEqual({ verdict: 'off-scale', token: '--space-1' });
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

    expect(reading.verdict).toBe('off-scale');
  });

  it('classifies a browser default by its value: 6px is off the scale', () => {
    const reading = classify(
      measured({ px: 6, authored: '6px', origin: 'user-agent' }),
      SCALE,
    );

    expect(reading).toEqual({ verdict: 'off-scale', token: '--space-1' });
  });

  it('classifies a browser default by its value: 8px is on it, though no token set it', () => {
    const reading = classify(
      measured({ px: 8, authored: '8px', origin: 'user-agent' }),
      SCALE,
    );

    expect(reading).toEqual({ verdict: 'raw-on-scale', token: '--space-2' });
  });

  it('never credits a token when the authored text is unknown', () => {
    const reading = classify(
      measured({ px: 16, authored: null, origin: 'unknown' }),
      SCALE,
    );

    expect(reading).toEqual({ verdict: 'raw-on-scale', token: '--space-4' });
  });

  it('reads the exemptions from the policy it is handed, not a copy of its own', () => {
    const policy = { ...LEDGER, exempt: [] };

    const reading = classify(
      measured({ px: 2, authored: '0.125rem', anchor: 'ds-badge' }),
      SCALE,
      policy,
    );

    expect(reading.verdict).toBe('off-scale');
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

  it('reports no source, never a guess, when nothing set the property', () => {
    const matched = payload();

    const result = winningDeclaration(matched, 'padding-top');

    expect(result).toEqual({ text: null, origin: 'unknown' });
  });
});

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
            verdict: 'off-scale',
          },
          {
            property: 'padding-top',
            px: 1,
            authored: '1px',
            origin: 'user-agent',
            token: '--space-1',
            verdict: 'off-scale',
          },
        ],
      },
    ],
  });

  /** Every object in `value`, rebuilt with its keys in reverse insertion order. */
  const reversedKeys = (value) => {
    if (Array.isArray(value)) return value.map(reversedKeys);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, inner]) => [key, reversedKeys(inner)]),
    );
  };

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

  it('keeps an exemption’s reason beside its verdict', () => {
    const exempt = ledger();
    exempt.elements[0].readings[0] = {
      property: 'padding-right',
      px: 2,
      authored: '0.125rem',
      origin: 'regular',
      token: null,
      verdict: 'exempt',
      reason: 'pill half-step',
    };

    const parsed = JSON.parse(serializeLedger(exempt));

    expect(parsed.elements[0].readings[1]).toMatchObject({
      verdict: 'exempt',
      reason: 'pill half-step',
    });
  });
});
