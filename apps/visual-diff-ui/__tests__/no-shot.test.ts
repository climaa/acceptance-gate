// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import NoShot from '../app/set/[label]/@modal/default';

/**
 * The set layout's `@modal` slot when no screenshot is open — a cold load of
 * `/set/[label]`, or a reload after the shot modal closed. Next needs a default
 * here or the unmatched slot answers 404; what this file decides is that the
 * slot then adds nothing over the set it sits on.
 *
 * Asserted on the value it returns rather than rendered, the way
 * intercepted-shot.test.tsx asserts the slot's other occupant and
 * no-comparison.test.ts asserts the report's matching default.
 */

describe('NoShot', () => {
  // Anything here would paint over the set on every plain visit to it.
  it('draws nothing, leaving the set alone on screen', () => {
    // Arrange: the slot takes no props — there is no screenshot to address.
    // Act
    const element = NoShot();

    // Assert
    expect(element).toBeNull();
  });
});
