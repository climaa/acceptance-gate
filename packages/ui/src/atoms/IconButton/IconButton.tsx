import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

export type IconButtonVariant = 'secondary' | 'ghost';
export type IconButtonSize = 'sm' | 'md';

interface IconButtonOwnProps<E extends ElementType> {
  /**
   * The element or component to render. Defaults to `'button'`.
   *
   * An arrow that navigates is a link, not a button, and this package must not
   * depend on `next` — so a caller passes its router link the way it does to
   * `Link` and `Tag`: `<IconButton as={NextLink} href="/blog/page/2" label="Next page">`.
   * `label` and the `aria-hidden` glyph wrapper hold whatever the element is.
   */
  as?: E;
  /**
   * The accessible name, and the whole of it.
   *
   * Required, and deliberately lifted out of `rest` rather than left to the
   * spread: a control with a glyph where its text would be has nothing to fall
   * back on, so a forgotten name is a button a screen reader announces as
   * "button" and nothing more. One name, one prop, and no way to end up with
   * two that disagree.
   */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  className?: string;
  /** The glyph. Wrapped in an `aria-hidden` span below, so it cannot leak into
   *  the name whatever the caller passes. */
  children: ReactNode;
}

export type IconButtonProps<E extends ElementType = 'button'> = IconButtonOwnProps<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof IconButtonOwnProps<E> | 'aria-label'>;

/**
 * A button whose whole content is one glyph.
 *
 * Board 01 names it and settles its tier; it is a primitive rather than
 * anything this repo's domain knows about, which is what puts it here beside
 * `Button` instead of in the app that first asked for it.
 *
 * Two things it does that a bare `<button>` at a call site would not, and they
 * are the reason it exists rather than a `Button` variant:
 *
 *  - `label` is required, so the accessible name cannot be forgotten. A fourth
 *    `Button` variant could not enforce that — `Button` takes children that are
 *    usually text, and text is its own name.
 *  - the glyph is wrapped in `aria-hidden` HERE. `ThemeToggle` wraps its
 *    crescent the same way; making it structural is what stops the next glyph
 *    from being announced.
 *
 * `type="button"` by default, unlike `Button`, which leaves it to the DOM. This
 * one is built to stand among fields, and a submit inside a form is the wrong
 * default for a control that fills one in.
 */
export function IconButton<E extends ElementType = 'button'>({
  as,
  label,
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: IconButtonProps<E>) {
  // Widened rather than defaulted in the destructuring (`as: Tag = 'button'`):
  // `Tag` would then be typed `E`, which `'button'` is not assignable to, and
  // JSX cannot check a spread against a still-generic element type.
  const Tag: ElementType = as ?? 'button';
  // Only a real <button> has a `type`, and only there does the default below
  // apply; `rest` follows it, so a caller who means submit still says so.
  const typeDefault = Tag === 'button' ? { type: 'button' } : undefined;

  return (
    <Tag
      {...typeDefault}
      className={[
        'ds-icon-btn',
        `ds-icon-btn--${variant}`,
        `ds-icon-btn--${size}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      // The tooltip a mouse user gets. `aria-label` is what names the button, so
      // the two cannot drift apart — they are the same string.
      title={label}
      {...rest}
    >
      <span className="ds-icon-btn__glyph" aria-hidden="true">
        {children}
      </span>
    </Tag>
  );
}
