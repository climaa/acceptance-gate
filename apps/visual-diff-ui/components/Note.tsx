import type { ReactNode } from 'react';

/**
 * A standing condition the console explains itself with — never a refusal.
 *
 * The distinction is the whole reason this has one home. `role="alert"` is
 * assertive: it interrupts, and it is for something the reviewer just did.
 * `role="note"` is for what is true on arrival and would be true if they had
 * done nothing. Writing an alert where a note belongs is not a style slip — the
 * acceptance suite reads refusals through one strict locator,
 * `getByRole('main').getByRole('alert')` (apps/e2e/pages/console.ts:64), so a
 * second alert inside `main` fails every scenario that reads the first. The run
 * panel's own comment already argues this at one call site; the rule now lives
 * where all of them can inherit it.
 *
 * `name` is not decoration. Every one of these is found by it — `note "accept
 * gate"`, `note "sample mode"`, `note "filter scope"` — because prose moves and
 * a name is what a scenario can hold.
 *
 * Deliberately not a `@gate/ui` atom. The design system also serves the blog,
 * which has no standing conditions to state, and a second consumer is the bar
 * this repo already set for promoting `BucketChip` and `Thumbnail`. There is
 * one here.
 *
 * No `'use client'`: it holds no state and takes no handler, so it renders in
 * both the server components that use it (`CanonicalSet`) and the client ones
 * that do (`RunPanel`, `FilterPicker`).
 */
export function Note({ name, children }: { name: string; children: ReactNode }) {
  return (
    <p role="note" aria-label={name} className="vd-note">
      {children}
    </p>
  );
}
