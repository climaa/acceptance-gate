import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://carleslima.dev'),
  title: {
    default: 'Carles Lima — Frontend engineering and quality',
    template: '%s · Carles Lima',
  },
  description:
    'Notes on Next.js, testing with Cypress and Gherkin, visual regression and coding agents.',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Carles Lima',
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
