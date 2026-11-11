import '@/styles/globals.css';
import '@/styles/explore.css';
import '@/styles/seo.css';
import '@/styles/finder.css';
import type { Metadata, Viewport } from 'next';
import { SITE_URL } from '@/lib/event-seo';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Chess Hotspot | Chess clubs and tournaments near you', template: '%s | Chess Hotspot' },
  description: 'Find a chess club, a tournament or a coach near you: a map of US chess clubs, a searchable tournament calendar, and a directory of coaches and schools.'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the filter bar and the bottom sheets pad themselves past the home indicator.
  viewportFit: 'cover',
  themeColor: '#f7fbf6',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full overflow-hidden w-full">
      <body className="h-full overflow-hidden w-full">{children}</body>
    </html>
  );
}
