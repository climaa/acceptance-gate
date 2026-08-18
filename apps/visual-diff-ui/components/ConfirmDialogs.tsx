'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Dialog, Stack } from '@gate/ui';

/**
 * D2, as the two dialogs that stand in front of every destructive control on the
 * console: nothing is deleted implicitly.
 *
 * The delete names the one set it removes. The prune names both halves — what
 * goes and what stays — because it is the only bulk path here and "the rest" is
 * precisely what the button cannot show.
 *
 * Neither dialog decides anything. The server refuses a held set and a running
 * job on its own (`DELETE /api/sets/[label]`, `POST /api/prune`), and what these
 * render is the sentence it refused with, verbatim: a reviewer who reads
 * `409 worktree_registered` has learned nothing, and the path of the worktree
 * still holding the set is the one thing they can act on.
 */

/** What a mutation this console could not reach at all comes back as. Not the
 *  server's words, because there were none — and saying so is better than an
 *  empty dialog that looks like it worked. */
const UNREACHABLE = 'the console could not reach the job API — is the server still up?';

/**
 * The sentence a refused mutation answered with.
 *
 * Every refusal in this app carries prose in `error` (lib/refusals.ts owns the
 * copy). A response that carries none is a failure nobody wrote a sentence for,
 * and the fallback names the action rather than the status, since "500" is not
 * something a reviewer can do anything with either.
 */
async function refusalOf(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // A refusal that is not JSON is still a refusal.
  }

  return fallback;
}

/** Refusals, in the server's words. `role="alert"` because it answers something
 *  the reviewer just did, and it appears inside the dialog they did it in. */
function Refusals({ sentences }: { sentences: readonly string[] }) {
  const [only] = sentences;

  return (
    <div role="alert" className="vd-alert">
      {sentences.length === 1 ? (
        <p className="vd-alert__line">{only}</p>
      ) : (
        <ul className="vd-alert__list">
          {sentences.map((sentence) => (
            <li key={sentence}>{sentence}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The pair every confirmation ends with: the act, then the way out. The
 *  destructive one is named for what it does, so the last thing read before the
 *  click is the thing being destroyed. */
function ConfirmActions({
  confirm,
  onConfirm,
  onCancel,
  busy,
  disabled,
}: {
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  disabled?: boolean;
}) {
  return (
    <Stack direction="row" gap={3} wrap>
      <Button variant="danger" onClick={onConfirm} disabled={busy || disabled}>
        {confirm}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        cancel
      </Button>
    </Stack>
  );
}

export interface DeleteSetButtonProps {
  label: string;
}

/**
 * The sets table's delete, with the confirmation D2 requires in front of it.
 *
 * The set label is encoded into the path: a registry entry whose label is not a
 * label names a directory outside `sets/`, and the route refuses it as a miss —
 * but it must reach the route as one segment rather than as a path.
 */
export function DeleteSetButton({ label }: DeleteSetButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpen(false);
    setRefusal(null);
  };

  const confirm = async () => {
    setBusy(true);
    setRefusal(null);

    try {
      const response = await fetch(`/api/sets/${encodeURIComponent(label)}`, {
        method: 'DELETE',
        cache: 'no-store',
      });

      if (!response.ok) {
        setRefusal(await refusalOf(response, `could not delete ${label}`));
        return;
      }

      close();
      // The table around this is server-rendered: the row survives the deletion
      // until the page is read again.
      router.refresh();
    } catch {
      setRefusal(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        delete
      </Button>

      <Dialog open={open} onClose={close} label="Confirm deletion">
        <Stack gap={4}>
          <p className="vd-confirm__question">
            Delete the snapshot set <strong className="vd-mono">{label}</strong>?
          </p>
          <p className="vd-confirm__detail">
            Its shots and its registry entry go. The reports that compared it stay — a
            report is a record of a decision, not part of the set it read.
          </p>

          {refusal && <Refusals sentences={[refusal]} />}

          <ConfirmActions
            confirm={`delete ${label}`}
            onConfirm={() => void confirm()}
            onCancel={close}
            busy={busy}
          />
        </Stack>
      </Dialog>
    </>
  );
}

export interface PruneButtonProps {
  /** How many of the latest sets survive — the retention control's number. */
  keep: number;
  /** Every set label, in the order the console shows them. */
  labels: readonly string[];
}

/** One named list of sets, or a sentence when there are none. Both halves of the
 *  prune dialog are this: what stays, and what goes. */
function SetList({ title, labels }: { title: string; labels: readonly string[] }) {
  return (
    <div className="vd-confirm__list">
      <p className="vd-confirm__list-title">{title}</p>
      {labels.length === 0 ? (
        <p className="vd-confirm__detail">nothing</p>
      ) : (
        <ul className="vd-confirm__labels">
          {labels.map((label) => (
            <li className="vd-mono" key={label}>
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The retention control's prune, with the confirmation that names both halves.
 *
 * The two lists are this client's reading of the order the console shows; the
 * server decides again from `sets.json` by `capturedAt`, and answers with what it
 * actually kept, removed and refused. That answer is what the dialog reports
 * afterwards — a skipped set leaves the dialog open on the reason rather than
 * closing on a promise the prune did not keep.
 */
export function PruneButton({ keep, labels }: PruneButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [refusals, setRefusals] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);

  const kept = labels.slice(0, keep);
  const doomed = labels.slice(keep);

  const close = () => {
    setOpen(false);
    setRefusals([]);
  };

  const confirm = async () => {
    setBusy(true);
    setRefusals([]);

    try {
      const response = await fetch('/api/prune', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ keep }),
      });

      if (!response.ok) {
        setRefusals([await refusalOf(response, 'could not prune the snapshot sets')]);
        return;
      }

      const body = (await response.json()) as { refused?: unknown };
      const skipped = Array.isArray(body.refused) ? (body.refused as string[]) : [];

      // Something moved either way, so the tables are re-read either way; only
      // the dialog's fate differs.
      router.refresh();
      if (skipped.length === 0) close();
      else setRefusals(skipped);
    } catch {
      setRefusals([UNREACHABLE]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        prune the rest
      </Button>

      <Dialog open={open} onClose={close} label="Confirm prune">
        <Stack gap={4}>
          <p className="vd-confirm__question">
            Prune the snapshot sets, keeping the latest{' '}
            <strong className="vd-mono">{keep}</strong>?
          </p>

          <SetList title="kept" labels={kept} />
          <SetList title="removed" labels={doomed} />

          {refusals.length > 0 && <Refusals sentences={refusals} />}

          <ConfirmActions
            confirm={`prune ${doomed.length} ${doomed.length === 1 ? 'set' : 'sets'}`}
            onConfirm={() => void confirm()}
            onCancel={close}
            busy={busy}
            disabled={doomed.length === 0}
          />
        </Stack>
      </Dialog>
    </>
  );
}
