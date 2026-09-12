import { Stack } from '@gate/ui';

/**
 * One labelled fact in a row of them — the grammar the corpus row and the set
 * viewer's provenance strip both read in.
 *
 * Extracted because the two were byte-identical, which is the state a drifting
 * pair passes through on its way to being one correct and one not (lib/paths.ts
 * makes the argument at length). `RunPanel` has a `Field` of its own and keeps
 * it: that one wraps a form control, and sharing a name is not sharing a shape.
 */
export function Field({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" gap={2} align="center">
      <span className="vd-field__label">{label}</span>
      <span className="vd-mono">{value}</span>
    </Stack>
  );
}
