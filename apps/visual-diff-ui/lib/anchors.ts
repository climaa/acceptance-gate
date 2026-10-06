/**
 * The history panel's id, shared by the template that renders it and the run
 * panel that scrolls to it when a comparison the pickers started finishes.
 *
 * A plain module rather than an export of a client component: the template is a
 * server component, and a value imported from a `'use client'` file reaches it
 * as a client reference rather than as the string.
 */
export const HISTORY_ANCHOR = 'vd-history';
