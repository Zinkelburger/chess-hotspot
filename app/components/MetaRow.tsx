import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

/** Date / place / cost row: a fixed icon gutter so the facts scan as a column. */
export default function MetaRow({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="meta-row">
      <span className="meta-row-icon">
        <Icon name={icon} />
      </span>
      <span className="meta-row-text">{children}</span>
    </div>
  );
}
