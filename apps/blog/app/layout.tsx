import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: {
    default: `${SITE_TITLE} — Frontend engineering and quality`,
    template: `%s · ${SITE_TITLE}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: SITE_TITLE,
  },
  alternates: {
    types: {
      'application/rss+xml': '/rss.xml',
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="ds-container site-header__inner">
            <Link href="/" className="site-brand">
              Carles Lima
            </Link>
            <nav className="site-nav">
              <Link href="/blog">Blog</Link>
              <Link href="/about">About</Link>
            </nav>
          </div>
        </header>

        <main className="ds-container">{children}</main>

        <footer className="site-footer">
          <div className="ds-container">
            © {new Date().getFullYear()} Carles Lima · Barcelona
          </div>
        </footer>
      </body>
    </html>
  );
}
