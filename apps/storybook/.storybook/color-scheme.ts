/** Light is the *absence* of `data-theme`: `tokens.css` has no `[data-theme='light']`
 *  block, so writing the attribute out for it would select nothing. Shared by every
 *  place that applies the toolbar's theme global — the story decorator and the docs
 *  container both need the exact same "what does unset mean" answer, or they'd drift
 *  out of sync with each other the first time either one changes independently. */
export const UNSET_THEME = 'light';

/** `data-theme` on `<html>`, never the OS colour-scheme media query: a media query
 *  cannot be set from a capture URL, so a differ driving it would be blind to one
 *  whole half of the matrix. `root` defaults to the document this module itself runs
 *  in, which is `iframe.html`'s document for both a story render and a docs render —
 *  addon-docs renders `DocsContainer` inside the same preview iframe as story canvases,
 *  not in the manager UI, so one target works for both callers. */
export function applyColorScheme(
  theme: string,
  root: HTMLElement = document.documentElement,
): void {
  if (theme === UNSET_THEME) {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}
