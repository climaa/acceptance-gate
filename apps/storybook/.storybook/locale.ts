/** What `<html lang>` said before any story set a locale: `iframe.html`'s own
 *  attribute, or nothing. Read once, when the preview loads, so an unlisted story
 *  rendered after a listed one gets the document it would have had anyway. */
const initialLang =
  typeof document === 'undefined' ? null : document.documentElement.getAttribute('lang');

/** `lang` on `<html>` from the locale global, set only for a story the capture
 *  listed for the locale axis. With no locale the attribute goes back to what the
 *  page shipped with, not to an empty string: `lang=""` is a different document,
 *  and every unlisted baseline was captured without it. */
export function applyLocale(
  locale: string | undefined,
  root: HTMLElement = document.documentElement,
): void {
  const lang = locale ?? initialLang;

  if (lang === null) {
    root.removeAttribute('lang');
  } else {
    root.setAttribute('lang', lang);
  }
}
