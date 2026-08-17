import { Button, Stack } from '@gate/ui';

/**
 * How many capture sets to keep, and the button that retires the rest.
 *
 * Rendered and named here, wired later: the confirm dialog D2 requires and
 * `POST /api/prune` behind it belong to the run-panel issue. Nothing is deleted
 * implicitly in this app, and a prune that fired straight off this button would
 * be exactly that.
 */

const KEEP_ID = 'vd-keep-latest';

/** Three sets is the board's default: the newest, the one before it, and the one
 *  a comparison is still open against. */
const DEFAULT_KEEP = 3;

export function RetentionControl() {
  return (
    <Stack direction="row" gap={3} align="center" wrap className="vd-retention">
      <label className="vd-retention__label" htmlFor={KEEP_ID}>
        keep latest
      </label>
      {/* Uncontrolled: the value is read by the prune request the run-panel
          issue adds, and a controlled input here would need client state for a
          number nothing has asked for yet. */}
      <input
        id={KEEP_ID}
        className="vd-retention__count"
        type="number"
        min={1}
        step={1}
        defaultValue={DEFAULT_KEEP}
        inputMode="numeric"
      />
      <Button variant="secondary" size="sm">
        prune the rest
      </Button>
    </Stack>
  );
}
