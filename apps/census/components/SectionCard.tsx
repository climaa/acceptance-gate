import type { ReactNode } from 'react';

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
          <h2 className="census-card__title">{title}</h2>
          {description !== undefined && (
            <p className="census-card__description">{description}</p>
          )}
        </header>
        {aside}
      </div>
      {children}
    </section>
  );
}
