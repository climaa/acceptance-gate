'use client';

import { useState } from 'react';
import { Button, Dialog, Stack } from '@gate/ui';
import { useMutation } from '@/hooks/useMutation';
import { PruneResponseSchema } from '@/lib/api-contract';

/**
 * D2, as the two dialogs that stand in front of every destructive control on the
 * console: nothing is deleted implicitly.
 *
 * A delete names the one thing it removes — a report or a set, and the two say
 * opposite things about what survives. The prune names both halves — what goes
 * and what stays — because it is the only bulk path here and "the rest" is
 * precisely what the button cannot show.
 *
 * Neither dialog decides anything. The server refuses a held set and a running
 * job on its own (`DELETE /api/reports/[id]`, `DELETE /api/sets/[label]`,
 * `POST /api/prune`), and what these render is the sentence it refused with,
 * verbatim: a reviewer who reads
 * `409 worktree_registered` has learned nothing, and the path of the worktree
 * still holding the set is the one thing they can act on.
 */

/** Refusals, in the server's words. `role="alert"` because it answers something
 *  the reviewer just did, and it appears inside the dialog they did it in.
 *
 *  Exactly one of these per dialog, always. `apps/e2e/pages/console.ts` reads a
 *  dialog's refusal with a strict `getByRole('dialog').getByRole('alert')`, so a
 *  second alert inside one dialog fails every scenario that reads a refusal —
 *  on ambiguity, not on the words. A standing condition belongs in the prose
 *  above the actions, never in a second alert. */
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

/**
 * What a delete leaves behind, one sentence each, and deliberately opposite.
 *
 * Module-level and each on one line: JSX collapses a wrapped run of CHILDREN to
 * a single space, but keeps a wrapped string ATTRIBUTE's newline and indent
 * verbatim. The two render identically in a browser — HTML collapses whitespace
 * either way — and differently in `textContent`, which is the half a test reads.
 */
const REPORT_DETAIL =
  'Its summary and its shots go, and the comparison is no longer on record. The two capture sets it compared stay exactly where they are.';

const SET_DETAIL =
  'Its shots and its registry entry go. The reports that compared it stay — a report is a record of a decision, not part of the set it read.';

/**
 * The delete confirmation both destructive rows open, as one component.
 *
 * `DeleteReportButton` and `DeleteSetButton` were this written out twice, and
 * only one of them was ever rendered by a test — including the two that carry
 * the rules: that a refusal is the server's sentence verbatim, and that it
 * announces from outside the landmark the dialog was opened inside (#319). One
 * implementation is how those become true of both, which is the reason to have
 * merged them; the lines saved are not.
 *
 * Four values differ, and they are the whole of the difference. `fallback` and
 * the confirm verb are NOT among them: both twins already derived those from the
 * name, so they stay derived here and cannot drift apart.
 *
 * `PruneButton` below deliberately does not use this. For a prune, `result.ok`
 * is not "done" — a 200 can carry a skipped set — and folding it in would mean
 * parameterising what success means. `useMutation` already ruled on that: it
 * hands the parsed body back rather than growing a callback per caller.
 */
function DeleteConfirmButton({
  name,
  url,
  noun,
  detail,
}: {
  /** The thing's own name. The question names it, and so does the confirm verb
   *  the reviewer reads last before pressing it. */
  name: string;
  /** Where the DELETE goes, already one segment. Built by the caller, because
   *  the REASON for encoding differs between the two — see `DeleteSetButton`. */
  url: string;
  /** A noun phrase carrying its article: "the report", "the screenshot set". The
   *  sentence is `Delete {noun} {name}?` and nothing here adds an article, so a
   *  bare "report" would read `Delete report main-…?` and no test would catch it
   *  for the other twin.
   *
   *  This shape assumes both questions stay `Delete <phrase> <name>?`. If one
   *  ever needs a different sentence, promote the whole question to a render
   *  prop for BOTH callers at once — a second string beside this one would put
   *  `<strong className="vd-mono">` back at each call site, which is the drift
   *  this component exists to prevent. */
  noun: string;
  /** The sentence, not the paragraph: this component owns the `<p>` and its
   *  class, so a caller cannot misspell or drop it. */
  detail: string;
}) {
  const [open, setOpen] = useState(false);
  const { run, refusals, busy, clear } = useMutation();

  const close = () => {
    setOpen(false);
    clear();
  };

  const confirm = async () => {
    const result = await run({
      url,
      method: 'DELETE',
      fallback: `could not delete ${name}`,
    });

    if (result.ok) close();
  };

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        delete
      </Button>

      <Dialog open={open} onClose={close} label="Confirm deletion">
        <Stack gap={4}>
          <p className="vd-confirm__question">
            Delete {noun} <strong className="vd-mono">{name}</strong>?
          </p>
          <p className="vd-confirm__detail">{detail}</p>

          {refusals.length > 0 && <Refusals sentences={refusals} />}

          <ConfirmActions
            confirm={`delete ${name}`}
            onConfirm={() => void confirm()}
            onCancel={close}
            busy={busy}
          />
        </Stack>
      </Dialog>
    </>
  );
}

export interface DeleteReportButtonProps {
  id: string;
}

/**
 * The reports table's delete, with the confirmation D2 requires in front of it.
 *
 * The twin of {@link DeleteSetButton}, and the dialog says the opposite thing on
 * purpose: deleting a set keeps the reports that compared it, and deleting a
 * report keeps the sets it compared. Neither cascades, and a reviewer about to
 * press one should be told which of the two they are doing.
 */
export function DeleteReportButton({ id }: DeleteReportButtonProps) {
  return (
    <DeleteConfirmButton
      name={id}
      url={`/api/reports/${encodeURIComponent(id)}`}
      noun="the report"
      detail={REPORT_DETAIL}
    />
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
 * but it must reach the route as one segment rather than as a path. The encode
 * stays here rather than inside {@link DeleteConfirmButton} because that is the
 * argument for it; a report id is validated where it is read (`lib/data.ts`), so
 * its encode is defence rather than this, and one shared comment would be a lie
 * about one of them.
 */
export function DeleteSetButton({ label }: DeleteSetButtonProps) {
  return (
    <DeleteConfirmButton
      name={label}
      url={`/api/sets/${encodeURIComponent(label)}`}
      noun="the screenshot set"
      detail={SET_DETAIL}
    />
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
  const [open, setOpen] = useState(false);
  const { run, refusals, busy, clear, refuse } = useMutation();

  const kept = labels.slice(0, keep);
  const doomed = labels.slice(keep);

  const close = () => {
    setOpen(false);
    clear();
  };

  const confirm = async () => {
    const result = await run({
      url: '/api/prune',
      method: 'POST',
      body: { keep },
      fallback: 'could not prune the screenshot sets',
    });

    if (!result.ok) return;

    // A prune can succeed and still have something to say: the server keeps the
    // sets a worktree holds and names them back. Something moved either way, so
    // the hook has already re-read the page; only the dialog's fate differs.
    //
    // Parsed against the schema the route annotates its answer with. A body this
    // cannot read carries no skip to report, so the dialog closes on the
    // mutation the server has already confirmed rather than staying open on a
    // sentence nobody wrote.
    const parsed = PruneResponseSchema.safeParse(result.body);
    const skipped = parsed.success ? parsed.data.refused : [];

    if (skipped.length === 0) close();
    else refuse(skipped);
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        prune the rest
      </Button>

      <Dialog open={open} onClose={close} label="Confirm prune">
        <Stack gap={4}>
          <p className="vd-confirm__question">
            Prune the screenshot sets, keeping the latest{' '}
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
