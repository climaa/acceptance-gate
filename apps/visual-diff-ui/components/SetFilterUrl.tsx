'use client';

import { useEffect } from 'react';
import { type SetFilter, setFilterQuery } from '@/lib/set-filter';

/** The two radio groups the bar draws, by `name`. */
const GROUPS = { theme: 'vd-theme', viewport: 'vd-viewport' } as const;

const checkedIn = (name: string) =>
  document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value;

/**
 * The set viewer's filter, mirrored into the URL so a filtered view is a link.
 *
 * The only client code on the page, and it renders nothing: the filtering
 * itself is still the radios and `set.css`'s `:has()` rules, so a page with no
 * JavaScript still filters, and a shared link still opens filtered — the server
 * checks the radios it names. This only writes back what the reader picks.
 *
 * `replaceState`, not a navigation: a filter is where the reader is, not a step
 * to go back through, and nothing about it needs the server. The tier fragment
 * rides along, so a jump and a filter can be shared together.
 */
export function SetFilterUrl() {
  useEffect(() => {
    const onChange = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.name !== GROUPS.theme && input.name !== GROUPS.viewport) return;

      const query = setFilterQuery({
        theme: checkedIn(GROUPS.theme),
        viewport: checkedIn(GROUPS.viewport),
      } as SetFilter);
      const { pathname, hash } = window.location;
      window.history.replaceState(
        null,
        '',
        `${pathname}${query ? `?${query}` : ''}${hash}`,
      );
    };

    document.addEventListener('change', onChange);
    return () => document.removeEventListener('change', onChange);
  }, []);

  return null;
}
