import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

/**
 * The typographic roles, in the order the type scale reads top to bottom. Each
 * one is a fixed pairing of family, step, weight and leading that tokens.css
 * backs with a real face — never a free combination of the four, because a
 * free combination is how a weight with no face gets asked for.
 */
export const TEXT_VARIANTS = [
  'heading-1',
  'heading-2',
  'heading-3',
  'title',
  'body',
  'body-sm',
  'caption',
  'label',
  'code',
] as const;

export type TextVariant = (typeof TEXT_VARIANTS)[number];

/**
 * The element a variant renders when no `as` is given. A heading variant is a
 * heading element, so the outline a page builds from its roles is the one a
 * screen reader walks; `as` is for the cases where the look and the level part.
 */
const DEFAULT_ELEMENT: Record<TextVariant, ElementType> = {
  'heading-1': 'h1',
  'heading-2': 'h2',
  'heading-3': 'h3',
  title: 'h3',
  body: 'p',
  'body-sm': 'p',
  caption: 'span',
  label: 'span',
  code: 'code',
};

interface TextOwnProps<E extends ElementType> {
  /**
   * The typographic role. Named `variant`, not `role`: `role` is the ARIA
   * attribute, and this component forwards every attribute it does not own.
   */
  variant?: TextVariant;
  /** The element or component to render. Defaults to the variant's own element. */
  as?: E;
  className?: string;
  children: ReactNode;
}

export type TextProps<E extends ElementType = 'p'> = TextOwnProps<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof TextOwnProps<E>>;

/** Text set in one of the design system's typographic roles. */
export function Text<E extends ElementType = 'p'>({
  variant = 'body',
  as,
  className,
  children,
  ...rest
}: TextProps<E>) {
  // Widened for the same reason as Tag's: JSX cannot check a spread against a
  // still-generic element type.
  const Component: ElementType = as ?? DEFAULT_ELEMENT[variant];

  return (
    <Component
      className={['ds-text', `ds-text--${variant}`, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </Component>
  );
}
