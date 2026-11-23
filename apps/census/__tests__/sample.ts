/**
 * `fixtures/sample/`: the measurement the home's screen stories draw, the tile's
 * figures as far as the schema carries them. Shared by the view-model tests so
 * each one reads the same committed pair the stories do.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseCommitted } from '@/lib/committed.ts';
import type { History, Measurement } from '@/lib/measurement.ts';

const SAMPLE = path.resolve(import.meta.dirname, '..', 'fixtures', 'sample');
const text = (name: string) => readFileSync(path.join(SAMPLE, `${name}.json`), 'utf8');

export function sample(): { measurement: Measurement; history: History } {
  const committed = parseCommitted({
    measurement: text('measurement'),
    history: text('history'),
  });
  if (committed.state !== 'measured') throw new Error('the sample is measured');
  return { measurement: committed.measurement, history: committed.history };
}

/** The sample is measured on 20 Nov 2026 at 17:42 UTC. */
export const SAMPLE_DAY = Date.parse('2026-11-20T17:42:00.000Z');
