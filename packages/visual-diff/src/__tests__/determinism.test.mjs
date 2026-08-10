import { Buffer } from 'node:buffer';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
  FREEZE_CSS,
  PINNED_NOW_ISO,
  RENDERED_PHASES,
  RENDER_PHASE_EXPRESSION,
  buildInitScript,
  isRenderedPhase,
  shotsEqual,
} from '../determinism.mjs';

/** A scratch realm with the init script already applied. Never this process's globals:
 *  the script pins `Date` and `Math.random` permanently, and vitest would run the rest
 *  of the suite against them. */
const pinnedRealm = () => {
  const realm = vm.createContext({ performance: { now: () => 1234.5 } });
  vm.runInContext(buildInitScript(), realm);
  return realm;
};

/** @param {vm.Context} realm @param {string} expression */
const evaluate = (realm, expression) => vm.runInContext(expression, realm);

/** @param {unknown} preview the value of `__STORYBOOK_PREVIEW__` in the page */
const renderPhaseReached = (preview) =>
  vm.runInContext(
    RENDER_PHASE_EXPRESSION,
    vm.createContext(preview === undefined ? {} : { __STORYBOOK_PREVIEW__: preview }),
  );

/** @param {string} phase */
const previewRendering = (phase) => ({
  storyRenders: [{ id: 'atoms-button--primary', phase }],
});

describe('buildInitScript', () => {
  it('pins `new Date()` to the one instant every capture reports', () => {
    const realm = pinnedRealm();

    const now = evaluate(realm, 'new Date().toISOString()');

    expect(now).toBe(PINNED_NOW_ISO);
  });

  it('pins `Date.now()` to that same instant', () => {
    const realm = pinnedRealm();

    const now = evaluate(realm, 'Date.now()');

    expect(now).toBe(Date.parse(PINNED_NOW_ISO));
  });

  it('leaves `Date.parse` working, so component date formatting still resolves', () => {
    const realm = pinnedRealm();

    const parsed = evaluate(realm, "Date.parse('2026-03-04T05:06:07.000Z')");

    expect(parsed).toBe(Date.parse('2026-03-04T05:06:07.000Z'));
  });

  it('leaves `Date.UTC` working', () => {
    const realm = pinnedRealm();

    const utc = evaluate(realm, 'Date.UTC(2026, 2, 4, 5, 6, 7)');

    expect(utc).toBe(Date.UTC(2026, 2, 4, 5, 6, 7));
  });

  it('honours an explicit constructor argument rather than pinning every date', () => {
    const realm = pinnedRealm();

    const explicit = evaluate(
      realm,
      "new Date('2026-03-04T05:06:07.000Z').toISOString()",
    );

    expect(explicit).toBe('2026-03-04T05:06:07.000Z');
  });

  it('zeroes `performance.now()`', () => {
    const realm = pinnedRealm();

    const elapsed = evaluate(realm, 'performance.now()');

    expect(elapsed).toBe(0);
  });

  it('draws the same `Math.random` sequence in two fresh evaluations', () => {
    const draw = 'Array.from({ length: 8 }, () => Math.random())';

    const sequences = [pinnedRealm(), pinnedRealm()].map((realm) =>
      evaluate(realm, draw),
    );

    expect(sequences[0]).toEqual(sequences[1]);
  });

  it('draws a varying sequence inside [0, 1), not one repeated number', () => {
    const realm = pinnedRealm();

    const sequence = evaluate(realm, 'Array.from({ length: 8 }, () => Math.random())');

    expect(new Set(sequence).size).toBe(sequence.length);
    for (const value of sequence) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('FREEZE_CSS', () => {
  it.each([
    ['animation', 'animation: none !important'],
    ['transition', 'transition: none !important'],
    ['caret', 'caret-color: transparent'],
    ['scroll behaviour', 'scroll-behavior: auto'],
    ['scrollbar', '::-webkit-scrollbar'],
  ])('freezes %s', (_label, rule) => {
    expect(FREEZE_CSS).toContain(rule);
  });

  it('hides the scrollbar rather than merely restyling it', () => {
    const scrollbarBlock = FREEZE_CSS.slice(FREEZE_CSS.indexOf('::-webkit-scrollbar'));

    expect(scrollbarBlock).toContain('display: none');
  });
});

describe('isRenderedPhase', () => {
  it('accepts every phase name a finished story reports', () => {
    const phases = ['finished', 'completed', 'played'];

    const accepted = phases.map((phase) => isRenderedPhase(phase));

    expect(accepted).toEqual([true, true, true]);
    expect([...RENDERED_PHASES].sort()).toEqual([...phases].sort());
  });

  it('rejects a story that is still pending or has errored', () => {
    const phases = ['pending', 'errored', 'loading', 'rendering'];

    const accepted = phases.map((phase) => isRenderedPhase(phase));

    expect(accepted).toEqual([false, false, false, false]);
  });
});

describe('RENDER_PHASE_EXPRESSION', () => {
  it.each(['finished', 'completed', 'played'])(
    'is true in-page for phase %s',
    (phase) => {
      const preview = previewRendering(phase);

      const reached = renderPhaseReached(preview);

      expect(reached).toBe(true);
    },
  );

  it.each(['pending', 'errored'])('is false in-page for phase %s', (phase) => {
    const preview = previewRendering(phase);

    const reached = renderPhaseReached(preview);

    expect(reached).toBe(false);
  });

  it('is false before the preview exists at all', () => {
    const reached = renderPhaseReached(undefined);

    expect(reached).toBe(false);
  });

  it('is false while the preview holds no render yet', () => {
    const preview = { storyRenders: [] };

    const reached = renderPhaseReached(preview);

    expect(reached).toBe(false);
  });

  it('is false while any one of several renders is unfinished', () => {
    const preview = {
      storyRenders: [
        { id: 'a', phase: 'played' },
        { id: 'b', phase: 'rendering' },
      ],
    };

    const reached = renderPhaseReached(preview);

    expect(reached).toBe(false);
  });
});

describe('shotsEqual', () => {
  it('is true for two buffers holding the same bytes', () => {
    const [a, b] = [Buffer.from([1, 2, 3, 4]), Buffer.from([1, 2, 3, 4])];

    const equal = shotsEqual(a, b);

    expect(equal).toBe(true);
  });

  it('is false for a one-byte difference', () => {
    const [a, b] = [Buffer.from([1, 2, 3, 4]), Buffer.from([1, 2, 3, 5])];

    const equal = shotsEqual(a, b);

    expect(equal).toBe(false);
  });

  it('is false for buffers of different lengths', () => {
    const [a, b] = [Buffer.from([1, 2, 3]), Buffer.from([1, 2, 3, 4])];

    const equal = shotsEqual(a, b);

    expect(equal).toBe(false);
  });
});
