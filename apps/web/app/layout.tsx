import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * This service is the portal app (app.boasis.ae later), not the marketing
 * site: it opens straight at the entry flow. The portal interior keeps its own
 * look; everything here is the rebuilt entry layer.
 */
export const metadata: Metadata = {
  title: {
    default: 'Boasis — your company file',
    template: '%s · Boasis',
  },
  description:
    'One place for a UAE free zone company: the licence, the people, the office, the dates that matter, and the documents that prove them.',
  applicationName: 'Boasis',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#05070f' },
    { media: '(prefers-color-scheme: light)', color: '#eef2f9' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Link tags are hoisted into the head by the App Router. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <body>
        <header className="shell topbar">
          <a className="brand" href="/">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">Boasis</span>
          </a>
          <span className="topbar-note">
            Already have an account? <a href="/signin">Sign in</a>
          </span>
        </header>
        {children}
        <footer className="shell foot">
          <span>Boasis holds your company file. It never files anything for you.</span>
          <nav>
            <a href="https://boasis.ae">boasis.ae</a>
            <a href="https://boasis.ae/privacy">Privacy</a>
            <a href="https://boasis.ae/terms">Terms</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
