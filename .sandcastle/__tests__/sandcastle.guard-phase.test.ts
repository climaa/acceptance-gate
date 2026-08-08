import { guardPhase } from '../sandcastle-guard-phase.mts';
import { read } from './helpers';

/**
 * REAL unit tests for the orchestration-phase guard.
 *
 * guardPhase turns a thrown phase (planner / stranded-rescue / merger) into a
 * value the loop can branch on, capturing whether the abort signal had fired by
 * the time the phase failed. That distinction is the whole point: a
 * SIGINT-driven shutdown must exit cleanly, while a real failure must record a
 * non-zero exit without crashing the process mid-run (the merger case runs after
 * branches are already pushed to origin).
 */
describe('guardPhase', () => {
  it('returns ok with the phase value when it resolves', async () => {
    // Arrange & Act
    const result = await guardPhase(
      async () => 42,
      () => false,
    );

    // Assert
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('captures a failure as not-aborted when the signal never fired', async () => {
    // Arrange
    const boom = new Error('sandbox crashed');

    // Act
    const result = await guardPhase(
      async () => {
        throw boom;
      },
      () => false,
    );

    // Assert
    expect(result).toEqual({ ok: false, aborted: false, error: boom });
  });

  it('captures a failure as aborted when the signal had fired', async () => {
    // Arrange & Act
    const result = await guardPhase(
      async () => {
        throw new Error('aborted');
      },
      () => true,
    );

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.aborted).toBe(true);
  });

  it('reads the abort state at failure time, not before the phase ran', async () => {
    // Arrange — the signal flips to aborted DURING the phase; guardPhase must
    // reflect the state as of the catch, so a shutdown that races the failure
    // is classified as a shutdown.
    let aborted = false;

    // Act
    const result = await guardPhase(
      async () => {
        aborted = true; // e.g. SIGINT handled while the phase was in flight
        throw new Error('rejected by abort');
      },
      () => aborted,
    );

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.aborted).toBe(true);
  });

  it('does not call isAborted on the success path', async () => {
    // Arrange
    let checked = false;

    // Act
    await guardPhase(
      async () => 'done',
      () => {
        checked = true;
        return false;
      },
    );

    // Assert — the abort classification only matters when a phase throws.
    expect(checked).toBe(false);
  });
});

describe('main.mts wiring (source-text — the loop is not unit-testable yet)', () => {
  // Behavioral coverage of the top-level loop waits on the EPIC C decomposition
  // into sandcastle-orchestrator.mts; until then these guard the F7 contract at
  // the source level: a thrown merger must not crash the run after the host push.
  const main = read('main.mts');

  it('guards the planner and merger awaits through guardPhase', () => {
    expect(main).toMatch(/import \{ guardPhase \}/);
    // The merger — the F7-critical await, run after branches are pushed.
    expect(main).toMatch(/guardPhase\(\s*\(\) =>\s*runMerger\(/);
  });

  it('records a non-zero exit on a phase failure instead of crashing', () => {
    expect(main).toMatch(/process\.exitCode = 1/);
  });

  it('still breaks (exits 0) on a graceful shutdown, not exit 1', () => {
    // The abort branch must break without setting exitCode — a SIGINT is not a
    // failure.
    expect(main).toMatch(/\.aborted\)\s*(\{\s*)?break/);
  });
});
