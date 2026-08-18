'use client';

import { useCallback, useEffect, useRef } from 'react';
import { cardElementId, type ReportCard } from '@/lib/report-view';

/**
 * The review loop, as four keys: `j`/`k` walk the cards, `space` marks the one
 * under the cursor, `n` jumps to the next one nobody has looked at.
 *
 * The cursor is the document's own focus, not a piece of React state. A card is
 * focusable by script (`tabIndex={-1}`) and draws its focus in CSS, so the
 * keyboard walk, a click and a screen reader's own navigation all leave the
 * reviewer in the same place — which a second, parallel notion of "current card"
 * could not promise.
 *
 * `b` and `esc` are deliberately unbound: they belong to the comparison modal
 * (#283), and a handler here would swallow the keys before that seam exists.
 */

/** Keys typed into a control are that control's, never the report's. */
const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

/** …and `space` additionally belongs to whatever is pressable under it. */
const PRESSABLE_TAGS = ['BUTTON', 'A', 'SUMMARY'];

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return target.isContentEditable || TYPING_TAGS.includes(target.tagName);
}

const isPressable = (target: EventTarget | null) =>
  target instanceof HTMLElement && PRESSABLE_TAGS.includes(target.tagName);

/** The card the focus is inside, as an index into `cards`, or -1 for none. */
function focusedIndex(cards: readonly ReportCard[]): number {
  const card = document.activeElement?.closest<HTMLElement>('[data-report-card]');
  if (!card) return -1;

  return cards.findIndex((entry) => entry.key === card.dataset.reportCard);
}

function focusCard(card: ReportCard | undefined): void {
  if (!card) return;

  const element = document.getElementById(cardElementId(card.key));
  element?.focus();
  // Absent in jsdom, and optional in the browsers that have it — a card that
  // cannot be scrolled to is still a card that took focus.
  element?.scrollIntoView?.({ block: 'center' });
}

export interface ReportKeysOptions {
  /** Every card currently rendered, in document order. */
  cards: readonly ReportCard[];
  isReviewed: (card: ReportCard) => boolean;
  onToggle: (card: ReportCard, reviewed: boolean) => void;
}

export interface ReportKeys {
  /** The `n` key's own action, exposed so the review bar's button is the same
   *  path rather than a second implementation of "next unreviewed". */
  nextUnreviewed: () => void;
}

export function useReportKeys(options: ReportKeysOptions): ReportKeys {
  // The listener binds once; what it reads has to be this render's answer, not
  // the one that was current when it bound. Written after the commit, never
  // during the render — nothing here is rendered from.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const nextUnreviewed = useCallback(() => {
    const { cards, isReviewed } = latest.current;
    const from = focusedIndex(cards);
    const ordered = [...cards.slice(from + 1), ...cards.slice(0, from + 1)];

    focusCard(ordered.find((card) => !isReviewed(card)));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;

      const { cards, isReviewed, onToggle } = latest.current;
      const index = focusedIndex(cards);

      if (event.key === 'j') focusCard(cards[Math.min(index + 1, cards.length - 1)]);
      else if (event.key === 'k') focusCard(cards[Math.max(index - 1, 0)]);
      else if (event.key === 'n') nextUnreviewed();
      else if (event.key === ' ' && !isPressable(event.target)) {
        const card = cards[index];
        if (!card) return;

        onToggle(card, !isReviewed(card));
      } else return;

      // Only the keys above: `space` scrolls the page and `j` may be someone
      // else's shortcut, but a key this hook ignored must reach whatever is next.
      event.preventDefault();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [nextUnreviewed]);

  return { nextUnreviewed };
}
