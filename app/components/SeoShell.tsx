import Link from 'next/link';
import type { ReactNode } from 'react';
export default function SeoShell({ children }: { children: ReactNode }) {
  return <div className="seo-page"><header className="seo-header"><Link href="/" className="seo-brand">♞ chess hotspot.</Link><nav aria-label="Main navigation"><Link href="/tournaments">Find a tournament</Link><Link href="/events">By state</Link><Link href="/">Clubs</Link><Link href="/learn">Coaches &amp; schools</Link></nav></header><main className="seo-content">{children}</main><footer className="seo-footer"><Link href="/events">Chess events across the United States</Link><p>Schedules and entry conditions come from the linked organizers. Confirm details before travelling.</p></footer></div>;
}
