import { Badge, type BadgeTone } from '@gate/ui';
import type { LegendItem } from '@/lib/workspace.ts';

const TONE: Partial<Record<LegendItem['tone'], BadgeTone>> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

/** An Icicle's colours, named: one Badge per tone the figure uses. */
export function Legend({ items }: { items: readonly LegendItem[] }) {
  return (
    <ul className="census-legend">
      {items.map((item) => (
        <li key={item.label}>
          <Badge tone={TONE[item.tone] ?? 'dashed'}>{item.label}</Badge>
        </li>
      ))}
    </ul>
  );
}
