/**
 * Parses `@gate/ui/tokens.css` for the Tokens docs page. The page imports the
 * sheet as raw text (`?raw`) and renders through these functions rather than
 * retyping any value — tokens.css stays the single source of truth.
 */

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const DECLARATION = /(--[\w-]+)\s*:\s*([^;]+);/g;

/** Index of the `}` closing the block opened at `openBrace`. */
function matchingBrace(sheet: string, openBrace: number): number {
  let depth = 0;
  for (let index = openBrace; index < sheet.length; index += 1) {
    if (sheet[index] === '{') depth += 1;
    if (sheet[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return sheet.length;
}

/**
 * Every custom property declared directly inside `selector`'s rule block.
 *
 * Comments come off the whole sheet first, not just the block: tokens.css's
 * header names both `:root` and `[data-theme='dark']` in prose above the rules,
 * and a search over the raw text finds that mention instead of the selector —
 * every dark role then reads out of `:root` and the two themes render alike.
 */
export function extractDeclarations(css: string, selector: string): Map<string, string> {
  const sheet = stripComments(css);
  const selectorIndex = sheet.indexOf(selector);
  if (selectorIndex === -1) {
    throw new Error(`no ${selector} rule in this sheet`);
  }

  const openBrace = sheet.indexOf('{', selectorIndex);
  const block = sheet.slice(openBrace + 1, matchingBrace(sheet, openBrace));
  const declarations = new Map<string, string>();
  for (const match of block.matchAll(DECLARATION)) {
    const [, prop, value] = match;
    if (prop === undefined || value === undefined) continue;
    declarations.set(prop, value.trim());
  }
  return declarations;
}

const VAR_REFERENCE = /^var\(\s*(--[\w-]+)\s*\)$/;

/** Follows a `var(--x)` chain in `map` until a literal remains. */
export function resolveVar(map: Map<string, string>, token: string): string {
  let value = map.get(token);
  while (value !== undefined) {
    const reference = VAR_REFERENCE.exec(value)?.[1];
    if (reference === undefined) return value;
    value = map.get(reference);
  }
  throw new Error(`${token} does not resolve to a literal`);
}

export type ColorRole = { name: string; light: string; dark: string };

/**
 * Every `--color-*` role, resolved to a literal in both themes. Raw `--c-*`
 * families are excluded on purpose — tokens.css's own contract is that
 * components consume roles only, so the palette a reader should see is the
 * same one a component author can reach.
 */
export function colorRoles(css: string): ColorRole[] {
  const root = extractDeclarations(css, ':root');
  const dark = new Map([...root, ...extractDeclarations(css, "[data-theme='dark']")]);

  return [...root.keys()]
    .filter((name) => name.startsWith('--color-'))
    .map((name) => ({
      name,
      light: resolveVar(root, name),
      dark: resolveVar(dark, name),
    }));
}

export type FontSizeStep = { name: string; value: string };

/** The `--text-*` scale, in the order tokens.css declares it. Theme-invariant
 *  — typography carries no colour, so there is only one scale to read. */
export function fontSizeSteps(css: string): FontSizeStep[] {
  const root = extractDeclarations(css, ':root');
  return [...root.keys()]
    .filter((name) => name.startsWith('--text-'))
    .map((name) => ({ name, value: resolveVar(root, name) }));
}
