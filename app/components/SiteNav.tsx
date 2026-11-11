import Link from 'next/link';
import clsx from 'clsx';

export type Section = 'clubs' | 'tournaments' | 'learn';

const LINKS: { key: Section; href: string; label: string; short: string }[] = [
  { key: 'clubs', href: '/', label: 'Clubs', short: 'Clubs' },
  { key: 'tournaments', href: '/tournaments', label: 'Tournaments', short: 'Tournaments' },
  { key: 'learn', href: '/learn', label: 'Coaches & schools', short: 'Lessons' },
];

/** The three things the site does, one tap apart. The current one is filled in. */
export default function SiteNav({ current }: { current?: Section }) {
  return (
    <nav className="site-nav" aria-label="Sections">
      {LINKS.map(link => (
        <Link
          key={link.key}
          href={link.href}
          aria-current={current === link.key ? 'page' : undefined}
          className={clsx('site-nav-link', `site-nav-${link.key}`)}
        >
          <span className={`pill-dot pill-dot-${link.key}`} aria-hidden="true" />
          <span className="site-nav-long">{link.label}</span>
          <span className="site-nav-short">{link.short}</span>
        </Link>
      ))}
    </nav>
  );
}
