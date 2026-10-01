import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boasis Portal",
  description:
    "Know, Tell, Guide, Keep — company file, reminders, guidance and vault for UAE free-zone companies.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Same faces as boasis.ae: Outfit / Plus Jakarta Sans / IBM Plex Mono */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600&family=Plus+Jakarta+Sans:wght@400;500&family=IBM+Plex+Mono:wght@500&display=swap"
        />
      </head>
      <body>
        <header className="portal-nav">
          <div className="portal-nav-bar">
            <span className="portal-brand">BOASIS</span>
            <span className="portal-tag">PORTAL</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
