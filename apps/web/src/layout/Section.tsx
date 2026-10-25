import { useState, type ReactNode } from 'react';

type Props = {
  id: string;
  title: string;
  /** Pinned sections (the review band) stay visually distinct. */
  pinned?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function Section({ id, title, pinned = false, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = `section-${id}`;
  return (
    <section className={`panel-section${pinned ? ' pinned' : ''}`}>
      <h2>
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
          <span aria-hidden="true">{open ? '▾' : '▸'}</span> {title}
          {pinned && <span className="pin-label"> · pinned</span>}
        </button>
      </h2>
      <div id={bodyId} hidden={!open} className="panel-body">
        {children}
      </div>
    </section>
  );
}
