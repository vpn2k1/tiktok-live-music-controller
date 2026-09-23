import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function Panel({ title, aside, children, className = '' }: PanelProps) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <h2>{title}</h2>
        {aside ? <div className="panel-aside">{aside}</div> : null}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
