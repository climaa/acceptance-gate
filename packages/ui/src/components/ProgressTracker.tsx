'use client';

import {
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

export type StepStatus = 'complete' | 'current' | 'future';

export interface ProgressStep {
  /** Identificador estable — no uses el índice. */
  id: string;
  /** Texto accesible y (si `withLabels`) visible bajo el nodo. */
  label: string;
  /** Icono opcional. Si no se pasa, se dibuja un punto. */
  icon?: ReactNode;
  status: StepStatus;
  /** Línea secundaria bajo la etiqueta: fecha, contacto, etc. */
  meta?: string;
}

export interface ProgressTrackerProps {
  steps: ProgressStep[];
  size?: 'sm' | 'md' | 'lg';
  /** Muestra label + meta bajo cada nodo. */
  withLabels?: boolean;
  /** Muestra las flechas de navegación a los lados. */
  withNavigation?: boolean;
  /** Índice seleccionado (modo controlado). `null` = ninguno. */
  selectedIndex?: number | null;
  /** Selección inicial en modo no controlado. */
  defaultSelectedIndex?: number | null;
  onSelectStep?: (index: number, step: ProgressStep) => void;
  /** Desactiva el click en los nodos (solo lectura). */
  readOnly?: boolean;
  'aria-label'?: string;
  className?: string;
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

/**
 * Stepper horizontal de progreso.
 *
 * Soporta modo controlado (`selectedIndex` + `onSelectStep`) y no controlado
 * (`defaultSelectedIndex`). El conector entre nodos se rellena hasta el último
 * paso `complete`, de modo que el estado se lee de un vistazo sin leer etiquetas.
 */
export function ProgressTracker({
  steps,
  size = 'md',
  withLabels = false,
  withNavigation = false,
  selectedIndex,
  defaultSelectedIndex = null,
  onSelectStep,
  readOnly = false,
  className,
  ...rest
}: ProgressTrackerProps) {
  const isControlled = selectedIndex !== undefined;
  const [internalIndex, setInternalIndex] = useState<number | null>(
    defaultSelectedIndex,
  );
  const activeIndex = isControlled ? selectedIndex : internalIndex;

  const select = useCallback(
    (index: number) => {
      if (readOnly) return;
      const step = steps[index];
      if (!step) return;
      if (!isControlled) setInternalIndex(index);
      onSelectStep?.(index, step);
    },
    [isControlled, onSelectStep, readOnly, steps],
  );

  const move = useCallback(
    (delta: number) => {
      if (steps.length === 0) return;
      const base = activeIndex ?? 0;
      select(clamp(base + delta, 0, steps.length - 1));
    },
    [activeIndex, select, steps.length],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        move(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move(-1);
      }
    },
    [move],
  );

  /** Índice del último paso completado — define hasta dónde se rellena la línea. */
  const lastCompleteIndex = useMemo(() => {
    let last = -1;
    steps.forEach((step, i) => {
      if (step.status === 'complete' || step.status === 'current') last = i;
    });
    return last;
  }, [steps]);

  const atStart = activeIndex !== null && activeIndex <= 0;
  const atEnd = activeIndex !== null && activeIndex >= steps.length - 1;

  if (steps.length === 0) return null;

  return (
    <div
      className={['ds-tracker', `ds-tracker--${size}`, className]
        .filter(Boolean)
        .join(' ')}
      role="group"
      aria-label={rest['aria-label'] ?? 'Progreso'}
      onKeyDown={onKeyDown}
    >
      {withNavigation && (
        <button
          type="button"
          className="ds-tracker__nav"
          onClick={() => move(-1)}
          disabled={atStart || activeIndex === null}
          aria-label="Paso anterior"
        >
          <ChevronLeft />
        </button>
      )}

      <ol className="ds-tracker__list">
        {steps.map((step, index) => {
          const isSelected = activeIndex === index;
          // La línea que llega a este nodo se rellena si el nodo anterior ya pasó.
          const connectorFilled = index > 0 && index <= lastCompleteIndex;

          return (
            <li key={step.id} className="ds-tracker__item">
              {index > 0 && (
                <span
                  className={[
                    'ds-tracker__connector',
                    connectorFilled && 'ds-tracker__connector--filled',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden="true"
                />
              )}

              <div className="ds-tracker__cell">
                <button
                  type="button"
                  className={[
                    'ds-tracker__node',
                    `ds-tracker__node--${step.status}`,
                    isSelected && 'ds-tracker__node--selected',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => select(index)}
                  disabled={readOnly}
                  aria-current={step.status === 'current' ? 'step' : undefined}
                  aria-pressed={readOnly ? undefined : isSelected}
                  title={step.label}
                >
                  <span className="ds-tracker__icon" aria-hidden="true">
                    {step.icon ?? <Dot />}
                  </span>
                  <span className="ds-tracker__sr">{step.label}</span>
                </button>

                {withLabels && (
                  <span className="ds-tracker__labels">
                    <span className="ds-tracker__label">{step.label}</span>
                    {step.meta && <span className="ds-tracker__meta">{step.meta}</span>}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {withNavigation && (
        <button
          type="button"
          className="ds-tracker__nav"
          onClick={() => move(1)}
          disabled={atEnd || activeIndex === null}
          aria-label="Paso siguiente"
        >
          <ChevronRight />
        </button>
      )}
    </div>
  );
}

/* ---------- iconos internos ---------- */

function Dot() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
