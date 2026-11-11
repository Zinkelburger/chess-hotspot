import clsx from 'clsx';
import type { ReactNode } from 'react';

/** A filter pill: filled in its colour when on, a white ghost when off. */
export default function Chip({
  active,
  activeClass = 'pretty-pill-blue',
  onClick,
  children,
  label,
}: {
  active: boolean;
  activeClass?: string;
  onClick: () => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={clsx('pretty-pill', active ? activeClass : 'pretty-pill-ghost')}
    >
      {children}
    </button>
  );
}
