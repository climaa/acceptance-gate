// Read against the real `designs/exports/`, as the designs route's test is: the
// tile maps a deployment ships are the ones a variant's board is looked up in.
import { describe, expect, it } from 'vitest';
import { readBoardHomes } from '../lib/board-homes';

describe('readBoardHomes', () => {
  it('finds a variant on the tier board whose tile map lists it', async () => {
    const homes = await readBoardHomes();

    expect(homes['atoms__desktop__light__atoms-badge--accent']).toBe('01-atoms');
  });

  it('knows nothing of a key no tile map lists', async () => {
    const homes = await readBoardHomes();

    expect(homes['atoms__desktop__light__atoms-nothing--here']).toBeUndefined();
  });
});
