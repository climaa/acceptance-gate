// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import NoComparison from '../app/report/[id]/@modal/default';

/**
 * The report layout's `@modal` slot when no comparison is open — a cold load of
 * `/report/[id]`, or a reload after the modal closed. Next needs a default here
 * or the unmatched slot answers 404; what this file decides is that the slot
 * then adds nothing over the report it sits on.
 *
 * Asserted on the value it returns rather than rendered, the way
 * intercepted-comparison.test.tsx asserts the slot's other occupant.
 */

describe('NoComparison', () => {
  // Anything here would paint over the report on every plain visit to it.
  it('draws nothing, leaving the report alone on screen', () => {
    // Arrange: the slot takes no props — there is no comparison to address.
    // Act
    const element = NoComparison();

    // Assert
    expect(element).toBeNull();
  });
});
