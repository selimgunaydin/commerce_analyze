import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { SignOutForm } from "@/src/components/auth/sign-out-form";
import "./globals.css";

export const metadata: Metadata = {
  title: "Entysa E-Commerce Audit",
  description: "AI destekli e-ticaret audit ve görev üretim paneli"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="tr">
      <body className="min-h-screen antialiased">
        <div className="border-b border-line bg-white">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href={session ? "/audits" : "/"} className="text-sm font-semibold text-ink">
              Entysa E-Commerce Audit
            </Link>
            {session ? (
              <nav className="flex items-center gap-3 text-sm text-muted">
                <Link href="/audits" className="hover:text-ink">
                  Auditler
                </Link>
                <Link href="/audits/new" className="hover:text-ink">
                  Yeni audit
                </Link>
                <SignOutForm />
              </nav>
            ) : (
              <Link href="/login" className="focus-ring inline-flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-[#0c6b5e]">
                Giriş
              </Link>
            )}
          </div>
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
