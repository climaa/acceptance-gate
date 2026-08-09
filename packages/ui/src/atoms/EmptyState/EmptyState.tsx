import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  message: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, message, action, className }: EmptyStateProps) {
  return (
    <div className={['ds-empty', className].filter(Boolean).join(' ')}>
      {icon && <div className="ds-empty__icon">{icon}</div>}
      <p className="ds-empty__message">{message}</p>
      {action && <div className="ds-empty__action">{action}</div>}
    </div>
  );
}
