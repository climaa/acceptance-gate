import type { ReactNode } from 'react';

import { Text } from '@gate/ui';
import type { Dimension } from '@/lib/measurement.ts';

export interface SectionCardProps {
  title: string;
  description?: ReactNode;
  /** Beside the heading, on its right: a range control. */
  aside?: ReactNode;
  className?: string;
  /** The dimension a `?dimension=` filter lights; the card's CSS dims the rest. */
  lit?: Dimension | null;
  children: ReactNode;
}

/** One card of the home: a mono caps heading, its line, then the figure. */
export function SectionCard({
  title,
  description,
  aside,
  className,
  lit,
  children,
}: SectionCardProps) {
  return (
    <section
      className={['census-card', className].filter(Boolean).join(' ')}
      data-lit={lit ?? undefined}
    >
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
