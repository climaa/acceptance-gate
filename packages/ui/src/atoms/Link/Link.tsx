import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

export type LinkTone = 'default' | 'muted';

interface LinkOwnProps<E extends ElementType> {
  /**
   * The element or component to render. Defaults to `'a'`.
   *
   * This package must not depend on `next`: it is framework-agnostic and
   * consumed through `transpilePackages`, so importing `next/link` would tie the
   * design system to one app's framework version. An app composes its own router
   * link instead — `<Link as={NextLink} href="/blog">` — and gets client routing
   * without this package knowing Next exists.
   */
  as?: E;
  tone?: LinkTone;
  className?: string;
  children: ReactNode;
}

/**
 * `href` is optional on an anchor's own attribute type, but an `<a>` with no
 * `href` is not a link — it carries no link role and no keyboard focus. Requiring
 * it back for the default element keeps that unreachable state out of the API,
 * while every other `as` target (a router link, a button) states its own props.
 */
type RequiredHref<E extends ElementType> = E extends 'a' ? { href: string } : unknown;

export type LinkProps<E extends ElementType = 'a'> = LinkOwnProps<E> &
  RequiredHref<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof LinkOwnProps<E>>;

/** Text link: the underline and focus ring are interaction states, not resting ones. */
export function Link<E extends ElementType = 'a'>({
  as,
  tone = 'default',
  className,
  children,
  ...rest
}: LinkProps<E>) {
  // Widened rather than defaulted in the destructuring (`as: Tag = 'a'`, as Stack
  // does): `Tag` would then be typed `E`, which `'a'` is not assignable to, and
  // JSX cannot check a spread against a still-generic element type.
  const Tag: ElementType = as ?? 'a';

  return (
    <Tag
      className={['ds-link', `ds-link--${tone}`, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  );
}
