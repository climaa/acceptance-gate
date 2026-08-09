import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

interface TagOwnProps<E extends ElementType> {
  /**
   * The element or component to render. Defaults to `'a'`.
   *
   * This package must not depend on `next`, so an app passes its own router
   * link — `<Tag as={NextLink} href="/tags/foo">` — and that component's own
   * props are type-checked in the anchor's place.
   */
  as?: E;
  className?: string;
  children: ReactNode;
}

/**
 * `href` is optional on an anchor's own attribute type, but a tag chip with no
 * `href` has nowhere to navigate — it carries no link role and no keyboard focus.
 * Requiring it back for the default element keeps that unreachable state out of
 * the API, while every other `as` target states its own props.
 */
type RequiredHref<E extends ElementType> = E extends 'a' ? { href: string } : unknown;

export type TagProps<E extends ElementType = 'a'> = TagOwnProps<E> &
  RequiredHref<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof TagOwnProps<E>>;

/** Navigable tag chip: the reader clicks it to reach `/tags/[tag]`. */
export function Tag<E extends ElementType = 'a'>({
  as,
  className,
  children,
  ...rest
}: TagProps<E>) {
  // Widened rather than defaulted in the destructuring (`as: Tag = 'a'`): `Tag`
  // would then be typed `E`, which `'a'` is not assignable to, and JSX cannot
  // check a spread against a still-generic element type.
  const Component: ElementType = as ?? 'a';

  return (
    <Component className={['ds-tag', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Component>
  );
}
