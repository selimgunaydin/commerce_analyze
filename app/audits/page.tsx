import { AuditStatus } from "@prisma/client";
import { Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/src/lib/db/prisma";

export const dynamic = "force-dynamic";

const statusLabels: Record<AuditStatus, string> = {
  QUEUED: "Sırada",
  CRAWLING: "Crawl",
  AUDITING: "Teknik Audit",
  COMPETITOR_ANALYSIS: "Rakip Analizi",
  AI_ANALYSIS: "AI Analizi",
  REPORT_READY: "Rapor Hazır",
  FAILED: "Hata",
  CANCELED: "İptal Edildi"
};

const statusClasses: Record<AuditStatus, string> = {
  QUEUED: "border-slate-300 bg-slate-100 text-slate-700",
  CRAWLING: "border-cyan-200 bg-cyan-50 text-cyan-800",
  AUDITING: "border-indigo-200 bg-indigo-50 text-indigo-800",
  COMPETITOR_ANALYSIS: "border-amber-200 bg-amber-50 text-amber-800",
  AI_ANALYSIS: "border-violet-200 bg-violet-50 text-violet-800",
  REPORT_READY: "border-emerald-200 bg-emerald-50 text-emerald-800",
  FAILED: "border-red-200 bg-red-50 text-red-800",
  CANCELED: "border-slate-300 bg-slate-100 text-slate-700"
};

const activeStatuses: AuditStatus[] = [
  AuditStatus.QUEUED,
  AuditStatus.CRAWLING,
  AuditStatus.AUDITING,
  AuditStatus.COMPETITOR_ANALYSIS,
  AuditStatus.AI_ANALYSIS
];

export default async function AuditsPage() {
  const audits = await prisma.auditProject.findMany({
    orderBy: {
      createdAt: "desc"
    },
    take: 50
  });

  const readyCount = audits.filter((audit) => audit.status === AuditStatus.REPORT_READY).length;
  const activeCount = audits.filter((audit) => activeStatuses.includes(audit.status)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-ink">Auditler</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            E-ticaret site auditlerini oluştur, takip et ve rapor hazır olduğunda incele.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/audits"
            className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-panel"
          >
            <RefreshCw aria-hidden="true" size={16} />
            Yenile
          </Link>
          <Link
            href="/audits/new"
            className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-[#0c6b5e]"
          >
            <Plus aria-hidden="true" size={16} />
            Yeni
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Toplam" value={audits.length} />
        <Metric label="Aktif" value={activeCount} />
        <Metric label="Hazır" value={readyCount} />
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-white">
        <div className="grid grid-cols-[1.2fr_130px_110px_150px] border-b border-line bg-panel px-4 py-3 text-xs font-semibold uppercase text-muted max-md:hidden">
          <span>Site</span>
          <span>Kapsam</span>
          <span>Durum</span>
          <span>Oluşturulma</span>
        </div>

        {audits.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium text-ink">Henüz audit yok</p>
            <p className="mt-1 text-sm text-muted">Bir e-ticaret sitesi URL'i ile başla.</p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {audits.map((audit) => (
              <Link
                key={audit.id}
                href={`/audits/${audit.id}`}
                className="grid gap-2 px-4 py-4 hover:bg-panel md:grid-cols-[1.2fr_130px_110px_150px] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{audit.brandName ?? audit.normalizedUrl}</p>
                  <p className="truncate text-xs text-muted">{audit.normalizedUrl}</p>
                </div>
                <div className="text-xs text-muted">{formatDepth(audit.depth)}</div>
                <div>
                  <StatusBadge status={audit.status} />
                </div>
                <time className="text-xs text-muted" dateTime={audit.createdAt.toISOString()}>
                  {formatDate(audit.createdAt)}
                </time>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: AuditStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusClasses[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatDepth(depth: string) {
  const labels: Record<string, string> = {
    QUICK: "Hızlı",
    STANDARD: "Standart",
    DEEP: "Derin"
  };

  return labels[depth] ?? depth;
}
