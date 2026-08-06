import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://carleslima.dev'),
  title: {
    default: 'Carles Lima — Ingeniería frontend y calidad',
    template: '%s · Carles Lima',
  },
  description:
    'Notas sobre Next.js, testing con Cypress y Gherkin, regresión visual y agentes de código.',
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Carles Lima',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="site-header">
          <div className="ds-container site-header__inner">
            <Link href="/" className="site-brand">
              Carles Lima
            </Link>
            <nav className="site-nav">
              <Link href="/blog">Blog</Link>
              <Link href="/sobre-mi">Sobre mí</Link>
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
