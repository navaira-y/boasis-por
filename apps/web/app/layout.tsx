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
      <body>{children}</body>
    </html>
  );
}
