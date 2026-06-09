import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commerce Audit",
  description: "AI commerce audit platform foundation"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="border-b border-line bg-white">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/audits" className="text-sm font-semibold text-ink">
              Commerce Audit
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <Link href="/audits" className="hover:text-ink">
                Audits
              </Link>
              <Link href="/audits/new" className="hover:text-ink">
                New audit
              </Link>
            </nav>
          </div>
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
