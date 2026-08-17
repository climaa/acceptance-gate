import type { CaptureSet } from '@/lib/summary';
import { SET_COLUMNS, setRow } from './SetRow';
import { Table } from './Table';

/** The name the acceptance scenario finds this table by. */
const SETS_TABLE_LABEL = 'Snapshot sets';

export interface SetsTableProps {
  sets: readonly CaptureSet[];
  /** Bytes on disk per set label. A set with no entry has no shot tree here —
   *  see lib/data.ts's `readSetSizes`, which measures rather than trusts. */
  sizes: Readonly<Record<string, number>>;
}

export function SetsTable({ sets, sizes }: SetsTableProps) {
  return (
    <Table
      label={SETS_TABLE_LABEL}
      columns={SET_COLUMNS}
      rows={sets.map((set) => setRow(set, sizes[set.label]))}
    />
  );
}
