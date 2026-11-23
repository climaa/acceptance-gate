import type { ReactNode } from 'react';

import { Text } from '@gate/ui';

export interface SectionCardProps {
  title: string;
  description?: ReactNode;
  /** Beside the heading, on its right: a range control. */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** One card of the home: a mono caps heading, its line, then the figure. */
export function SectionCard({
  title,
  description,
  aside,
  className,
  children,
}: SectionCardProps) {
  return (
    <section className={['census-card', className].filter(Boolean).join(' ')}>
      <div className="census-card__head">
        <header className="census-card__heading">
          <Text as="h2" variant="label" className="census-card__title">
            {title}
          </Text>
          {description !== undefined && (
            <Text variant="body-sm" className="census-card__description">
              {description}
            </Text>
          )}
        </header>
        {aside}
      </div>
      {children}
    </section>
  );
}
