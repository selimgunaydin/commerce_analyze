import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, BarChart3, CheckCircle2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();

  if (session) {
    redirect("/audits");
  }

  return (
    <div className="mx-auto max-w-5xl py-10">
      <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase text-muted">Entysa E-Commerce Audit</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink md:text-5xl">
            E-ticaret auditlerini kanıttan uygulanabilir göreve dönüştür.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
            Site crawl, Lighthouse, erişilebilirlik, e-ticaret detector ve rakip kıyasını tek panelde toplar; PM ve developer için net aksiyon listesi üretir.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/login" className="focus-ring inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-[#0c6b5e]">
              Panele giriş
              <ArrowRight aria-hidden="true" size={17} />
            </Link>
          </div>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-3">
            <SummaryItem icon={<BarChart3 aria-hidden="true" size={18} />} title="Skor kartı" text="UX, dönüşüm, SEO, performans, erişilebilirlik ve rakip konumu birlikte izlenir." />
            <SummaryItem icon={<CheckCircle2 aria-hidden="true" size={18} />} title="Görev listesi" text="Tekrarlı bulgular gruplanır; her görev kanıt, öneri ve kabul kriteriyle verilir." />
            <SummaryItem icon={<ShieldCheck aria-hidden="true" size={18} />} title="Korumalı panel" text="Register yoktur; erişim env üzerinden tanımlı tek kullanıcıyla yapılır." />
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryItem({ icon, text, title }: { icon: ReactNode; text: string; title: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-line bg-panel p-4">
      <div className="mt-0.5 text-accent">{icon}</div>
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
      </div>
    </div>
  );
}
