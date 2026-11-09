import type { ComponentProps, ReactNode } from 'react';

const iconPaths = {
  file: <><path d="M5 3h9l5 5v13H5z" /><path d="M14 3v5h5M8 12h8m-8 4h8" /></>,
  archive: <><path d="M4 8h16v13H4zM3 3h18v5H3zM9 12h6" /></>,
  settings: <><path d="M4 6h16M4 12h16M4 18h16" /><path d="M9 3v6m6 0v6m-6 0v6" /></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" /></>,
  download: <><path d="M12 3v13m-5-5 5 5 5-5M4 16v4h16v-4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  folder: <path d="M3 6h7l2 2h9v11H3z" />,
  route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8v.1" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  minus: <path d="M5 12h14" />,
  fit: <path d="M9 4H4v5m11-5h5v5m0 6v5h-5m-6 0H4v-5" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  save: <><path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-8h8v8" /></>,
  shield: <><path d="m12 3 8 3v5c0 5-3 8-8 10-5-2-8-5-8-10V6z" /><path d="m8 12 3 3 5-6" /></>,
};

export function Icon({ name }: { name: keyof typeof iconPaths }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

export function Field({ label, className, ...props }: ComponentProps<'input'> & { label: string }) {
  return <label className={'field' + (className ? ' ' + className : '')}><span>{label}</span><input {...props} /></label>;
}

export function Section({ number, title, description, action, children }: {
  number: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="form-sheet" aria-labelledby={'section-' + number}>
      <header className="sheet-heading">
        <span className="index">{number}</span>
        <div><h2 id={'section-' + number}>{title}</h2>{description && <p>{description}</p>}</div>
        {action && <div className="sheet-actions">{action}</div>}
      </header>
      {children}
    </section>
  );
}

export const money = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
