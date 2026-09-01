'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ThreadStatus } from '@/lib/changelog-sync-asset';
import {
  discussionTerm,
  giscusScriptAttributes,
  GISCUS_ORIGIN,
  GISCUS_SCRIPT_URL,
  isGiscusMetadataMessage,
} from '@/lib/giscus';

/**
 * How long a mount is given before it is called a failure.
 *
 * The only timeout this feature is allowed to have, and it can only ever
 * conclude the negative. A timer that concluded success would be a green check
 * over a conversation that never arrived — the exact lie the rest of the design
 * is arranged to prevent, reached by the laziest possible route.
 *
 * Fifteen seconds because what is being waited on is a third-party iframe doing
 * its own network work: a slow phone on a bad connection is ordinary and should
 * not be told it failed, while a reader watching past this point has already
 * concluded the same thing the timer is about to.
 */
const MOUNT_TIMEOUT_MS = 15_000;

/** What the caller wants to know as a mount starts and ends. */
export interface ThreadEvents {
  /** A mount has begun for this release. */
  onStarted(tag: string): void;
  /** A mount has ended, once, one way or the other. */
  onSettled(tag: string, outcome: 'ready' | 'failed'): void;
}

export interface GiscusThreads {
  /** Every release that has been asked about, and how it went. */
  statuses: Record<string, ThreadStatus>;
  /** Mounts one release's thread. Does nothing if the page has no container for it. */
  open(tag: string): void;
}

/** Whether the document is in the dark theme. The attribute decides — its absence is light. */
function isDark(): boolean {
  return document.documentElement.dataset.theme === 'dark';
}

/**
 * The container the page rendered under one release, or null when that release
 * is not on the page.
 *
 * Iterated rather than built into a selector string, so a tag can never be
 * interpolated into one — the containers are read, never addressed by a value
 * that came from data.
 */
export function threadContainer(tag: string): HTMLElement | null {
  const containers = document.querySelectorAll<HTMLElement>('[data-release-comments]');
  for (const container of containers) {
    if (container.dataset.releaseComments === tag) return container;
  }
  return null;
}

/**
 * Injects giscus's loader into one release's container.
 *
 * The script is created by the press rather than rendered with the page, which
 * is the whole economy of this feature: four embeds mounted on every visit
 * would be four iframes, four sets of requests and four thread renders, paid
 * for by every reader including the ones who never open a conversation.
 */
function injectLoader(container: HTMLElement, tag: string, onError: () => void): void {
  const script = document.createElement('script');
  script.src = GISCUS_SCRIPT_URL;
  script.async = true;

  const attributes = giscusScriptAttributes(discussionTerm(tag), isDark());
  for (const [name, value] of Object.entries(attributes)) {
    script.setAttribute(name, value);
  }

  // The script failing to load is the one failure that reports itself. Every
  // other way this can go wrong is silent from out here, which is what the
  // timeout is for.
  script.addEventListener('error', onError);
  container.append(script);
}

/**
 * The release conversations: which are open, and how one gets opened.
 *
 * Split out of `ChangelogSyncButton` because it is a whole concern of its own —
 * a third-party script, a cross-origin message channel and a set of races — and
 * none of it is about an icon. What the animation does with any of this is the
 * caller's business, expressed as two callbacks, which is what keeps the giscus
 * mechanics testable in their own right and the component down to the part that
 * decides what a press means.
 */
export function useGiscusThreads(events: ThreadEvents): GiscusThreads {
  const [statuses, setStatuses] = useState<Record<string, ThreadStatus>>({});

  /** In-flight mounts, by tag. A reader can start one, scroll on, and start another. */
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Read from timers and message handlers that run long after the commit that
  // installed them, so the callbacks they reach are the current ones. Written in
  // an effect, never during render: a ref write is a side effect, and React may
  // call a render twice and discard one result.
  const latest = useRef(events);
  useEffect(() => {
    latest.current = events;
  });

  /**
   * Ends one mount, once.
   *
   * Guarded on the tag still being pending, which is what makes the two racing
   * answers — the metadata message and the timer — settle to whichever arrived
   * first, instead of the timer overwriting a thread that landed at 14.9
   * seconds with a failure.
   */
  const settle = useCallback((tag: string, outcome: 'ready' | 'failed') => {
    const timer = pending.current.get(tag);
    if (timer === undefined) return;

    clearTimeout(timer);
    pending.current.delete(tag);
    setStatuses((previous) => ({ ...previous, [tag]: outcome }));
    latest.current.onSettled(tag, outcome);
  }, []);

  /**
   * The metadata message, filtered three ways.
   *
   * Origin, then shape, then — the one that is not obvious — that it came from
   * THIS container's own frame. Every embed already open keeps posting on this
   * channel for as long as it is on the page, so origin and shape alone would
   * let an older thread's traffic answer for a mount still in flight: a check
   * mark over a conversation that never rendered.
   */
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== GISCUS_ORIGIN) return;
      if (!isGiscusMetadataMessage(event.data)) return;

      for (const tag of pending.current.keys()) {
        const frame = threadContainer(tag)?.querySelector('iframe');
        if (frame && event.source === frame.contentWindow) {
          settle(tag, 'ready');
          return;
        }
      }
    };

    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [settle]);

  /** Nothing left running when the page goes away. */
  useEffect(() => {
    const timers = pending.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const open = useCallback(
    (tag: string) => {
      const container = threadContainer(tag);
      if (!container) return;

      setStatuses((previous) => ({ ...previous, [tag]: 'loading' }));
      latest.current.onStarted(tag);

      pending.current.set(
        tag,
        setTimeout(() => settle(tag, 'failed'), MOUNT_TIMEOUT_MS),
      );

      injectLoader(container, tag, () => settle(tag, 'failed'));
    },
    [settle],
  );

  return { statuses, open };
}
