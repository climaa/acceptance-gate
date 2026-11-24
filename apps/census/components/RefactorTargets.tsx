import { Badge } from '@gate/ui';
import type { TargetView } from '@/lib/targets.ts';

/** The list both pages draw: path, what fallow recommends, effort, priority. */
export function RefactorTargets({
  targets,
  count,
}: {
  targets: readonly TargetView[];
  count: number;
}) {
  return (
    <>
      <div className="census-targets__head">
        <h3 className="census-subtitle-caps">Refactor targets · {count}</h3>
        <span className="census-caption">priority</span>
      </div>
      <ul className="census-targets">
        {targets.map((t) => (
          <li key={t.path} className="census-target">
            <a href={t.href}>{t.path}</a>
            <span className="census-target__action">{t.action}</span>
            <Badge tone="dashed">{t.effort}</Badge>
            <span className="census-target__priority">{t.priority}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
