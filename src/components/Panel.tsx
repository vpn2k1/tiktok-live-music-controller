import type { ReactNode } from 'react';
import { t } from '../shared/i18n';

interface PanelProps {
  /** Vietnamese source text or an already translated one; translated here. */
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function Panel({ title, aside, children, className = '' }: PanelProps) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <h2>{t(title)}</h2>
        {aside ? <div className="panel-aside">{aside}</div> : null}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
