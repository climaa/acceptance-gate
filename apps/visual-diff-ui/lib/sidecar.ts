import * as fs from 'node:fs';
import { logger } from '@gate/logger';
import type { z } from 'zod';

/**
 * A JSON sidecar read through its schema, or null — the bulkhead both ledger
 * readers share (lib/ledger.ts for a report, lib/set-ledger.ts for a set's shot).
 *
 * SERVER-ONLY: it opens a file. Silent for a file that is simply absent, which
 * is the ordinary case; logged for one that is there and will not be read —
 * unreadable, not JSON, or not the shape it claims — because that is a producer
 * or a disk saying something, and the caller's null alone would not.
 */
export async function readSidecar<T>(
  file: string,
  schema: z.ZodType<T>,
  what: string,
): Promise<T | null> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(file, 'utf8');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`could not read the ${what} ${file}`, cause);
    }

    return null;
  }

  try {
    return schema.parse(JSON.parse(raw));
  } catch (cause) {
    logger.warn(`${file} does not match the ${what} schema`, cause);

    return null;
  }
}
