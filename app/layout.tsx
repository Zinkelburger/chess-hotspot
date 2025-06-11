import '@/styles/globals.css';
import { ReactNode } from 'react';

export const metadata = {
  title: 'Chess Hotspots',
  description: 'Find pick-up games, clubs and tournaments'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full overflow-hidden w-full">
      <body className="h-full overflow-hidden w-full">{children}</body>
    </html>
  );
}
