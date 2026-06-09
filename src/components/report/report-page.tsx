import type { AuditPage } from "@prisma/client";
import type { CompetitorComparison, FinalAuditReport } from "@/src/lib/ai/schemas";
import { MarkdownActions } from "./markdown-actions";

export function AuditReportView({
  competitorComparison,
  finalReport,
  markdown,
  pages
}: {
  competitorComparison: CompetitorComparison | null;
  finalReport: FinalAuditReport;
  markdown: string;
  pages: AuditPage[];
}) {
  const homePages = pages.filter((page) => page.pageType === "home");
  const plpPages = pages.filter((page) => page.pageType === "plp");
  const pdpPages = pages.filter((page) => page.pageType === "pdp");
  const opportunities = dedupeOpportunities(finalReport.opportunities);
  const quickWins = dedupeOpportunities(finalReport.quickWins);
  const strategicProjects = dedupeOpportunities(finalReport.strategicProjects);

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-line bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-muted">Entysa E-Commerce Audit Raporu</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Genel skor {Math.round(finalReport.scorecard.overall)}</h1>
            <p className="mt-3 max-w-4xl text-sm text-muted">{finalReport.executiveSummary}</p>
          </div>
          <MarkdownActions markdown={markdown} />
        </div>
      </section>

      <ReportSection title="Yönetici Özeti">
        <p className="text-sm text-muted">{finalReport.executiveSummary}</p>
      </ReportSection>

      <ReportSection title="Site Profili">
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Sektör" value={finalReport.siteProfile.likelyIndustry} />
          <Metric label="Tip" value={formatToken(finalReport.siteProfile.ecommerceType)} />
          <Metric label="Güven" value={`${Math.round(finalReport.siteProfile.confidence * 100)}%`} />
        </div>
        <p className="mt-3 text-sm text-muted">
          Hedef kitle: {finalReport.siteProfile.targetAudience}. Fiyat konumu: {formatToken(finalReport.siteProfile.pricePositioning)}.
        </p>
      </ReportSection>

      <ReportSection title="Skor Kartı">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <Score label="Genel" value={finalReport.scorecard.overall} />
          <Score label="UX" value={finalReport.scorecard.ux} />
          <Score label="Dönüşüm" value={finalReport.scorecard.conversion} />
          <Score label="Performans" value={finalReport.scorecard.performance} />
          <Score label="SEO" value={finalReport.scorecard.seo} />
          <Score label="Erişilebilirlik" value={finalReport.scorecard.accessibility} />
          <Score label="Rakipler" value={finalReport.scorecard.competitorPositioning} />
        </div>
      </ReportSection>

      <ReportSection title="Öne Çıkan Bulgular">
        <TextList items={finalReport.topFindings} />
      </ReportSection>

      <ReportSection title="Rakip Özeti">
        <p className="text-sm text-muted">{finalReport.competitorSummary}</p>
        {competitorComparison?.gaps.length ? (
          <div className="mt-4 space-y-2">
            {competitorComparison.gaps.slice(0, 6).map((gap) => (
              <div key={`${gap.area}-${gap.recommendation}`} className="rounded-md border border-line bg-panel px-3 py-2">
                <p className="text-sm font-medium text-ink">{gap.area}</p>
                <p className="mt-1 text-sm text-muted">{gap.recommendation}</p>
              </div>
            ))}
          </div>
        ) : null}
      </ReportSection>

      <ReportSection title="Müşteri Gözüyle İçgörüler">
        <OpportunityCustomerLens opportunities={opportunities} />
      </ReportSection>

      <ReportSection title="Öncelikli Yol Haritası">
        <OpportunitySummaryList quickWins={quickWins} strategicProjects={strategicProjects} />
      </ReportSection>

      <PageFindingSection title="Ana Sayfa Bulguları" pages={homePages} />
      <PageFindingSection title="Listeleme Bulguları" pages={plpPages} />
      <PageFindingSection title="Ürün Detay Bulguları" pages={pdpPages} />

      <ReportSection title="Teknik Audit">
        <TechnicalSummary pages={pages} kind="performance" />
      </ReportSection>

      <ReportSection title="SEO Audit">
        <TechnicalSummary pages={pages} kind="seo" />
      </ReportSection>

      <ReportSection title="Erişilebilirlik Audit">
        <TechnicalSummary pages={pages} kind="accessibility" />
      </ReportSection>

      <ReportSection title="Tam Görev Listesi">
        <OpportunityList opportunities={opportunities} />
      </ReportSection>

      <ReportSection title="Kanıt Ekran Görüntüleri">
        {finalReport.technicalAppendix.screenshots.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {finalReport.technicalAppendix.screenshots.slice(0, 8).map((screenshot) => (
              <a key={screenshot} href={storageUrl(screenshot)} target="_blank" rel="noreferrer" className="block">
                <img src={storageUrl(screenshot)} alt="Audit ekran görüntüsü kanıtı" className="h-80 w-full rounded-md border border-line object-cover object-top" />
              </a>
            ))}
          </div>
        ) : (
          <Empty>Ekran görüntüsü kanıtı yok.</Empty>
        )}
      </ReportSection>

      <ReportSection title="Teknik Ek">
        <div className="grid gap-3 md:grid-cols-2">
          <TextList label="Crawl edilen sayfalar" items={finalReport.technicalAppendix.crawledPages} />
          <TextList label="Ekran görüntüleri" items={finalReport.technicalAppendix.screenshots} />
        </div>
      </ReportSection>
    </div>
  );
}

function ReportSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="space-y-3">
      <div className="border-b border-line pb-3">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

function PageFindingSection({ pages, title }: { pages: AuditPage[]; title: string }) {
  return (
    <ReportSection title={title}>
      {pages.length > 0 ? (
        <div className="space-y-3">
          {pages.map((page) => (
            <div key={page.id} className="rounded-md border border-line bg-white p-3">
              <p className="break-words text-sm font-medium text-ink">{page.title ?? page.url}</p>
              <TextList items={failedDetectorLabels(page.detectorResults).slice(0, 6)} />
            </div>
          ))}
        </div>
      ) : (
        <Empty>Bu tipte crawl edilmiş sayfa yok.</Empty>
      )}
    </ReportSection>
  );
}

function TechnicalSummary({ kind, pages }: { kind: "performance" | "seo" | "accessibility"; pages: AuditPage[] }) {
  const items = pages.map((page) => {
    const lighthouse = asRecord(page.lighthouse);
    const accessibility = asRecord(page.accessibility);

    if (kind === "accessibility") {
      return `${page.pageType}: axe ihlal ${accessibility?.violationCount ?? "yok"}, Lighthouse erişilebilirlik ${lighthouse?.accessibility ?? "yok"}`;
    }

    return `${page.pageType}: Lighthouse ${kind} ${lighthouse?.[kind] ?? "n/a"}`;
  });

  return <TextList items={items} />;
}

function OpportunityCustomerLens({ opportunities }: { opportunities: FinalAuditReport["opportunities"] }) {
  if (opportunities.length === 0) {
    return <Empty>Müşteri perspektifi içgörüsü yok.</Empty>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {opportunities.slice(0, 6).map((opportunity) => (
        <article key={`${opportunity.title}-customer-lens`} className="rounded-md border border-line bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900">
              {formatToken(opportunity.customerJourneyStage)}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
              {formatToken(opportunity.category)}
            </span>
          </div>
          <h3 className="mt-3 text-sm font-semibold text-ink">{opportunity.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{opportunity.customerProblem}</p>
          <p className="mt-2 text-sm leading-6 text-ink">{opportunity.customerBenefit}</p>
          <p className="mt-2 text-xs leading-5 text-muted">{opportunity.businessRationale}</p>
        </article>
      ))}
    </div>
  );
}

function OpportunitySummaryList({
  quickWins,
  strategicProjects
}: {
  quickWins: FinalAuditReport["opportunities"];
  strategicProjects: FinalAuditReport["opportunities"];
}) {
  const items = [
    ...quickWins.slice(0, 6).map((opportunity) => ({ label: "Hızlı kazanım", opportunity })),
    ...strategicProjects.slice(0, 4).map((opportunity) => ({ label: "Stratejik", opportunity }))
  ];

  if (items.length === 0) {
    return <Empty>Öncelikli görev yok.</Empty>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map(({ label, opportunity }) => (
        <article key={`${label}-${opportunity.title}`} className="rounded-md border border-line bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line bg-panel px-2 py-1 text-xs font-medium text-muted">{label}</span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
              {formatToken(opportunity.priority)}
            </span>
          </div>
          <h3 className="mt-3 text-sm font-semibold text-ink">{opportunity.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            {formatToken(opportunity.estimatedEffort)} efor · {formatToken(opportunity.expectedImpact)} etki · {formatToken(opportunity.category)}
          </p>
        </article>
      ))}
    </div>
  );
}

function OpportunityList({ opportunities }: { opportunities: FinalAuditReport["opportunities"] }) {
  if (opportunities.length === 0) {
    return <Empty>Bu bölümde görev yok.</Empty>;
  }

  return (
    <div className="space-y-3">
      {opportunities.map((opportunity) => (
        <article key={opportunity.title} className="rounded-md border border-line bg-white p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink">{opportunity.title}</h3>
              <p className="mt-2 text-sm text-muted">{opportunity.description}</p>
            </div>
            <span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
              {formatToken(opportunity.priority)}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <Metric label="Efor" value={formatToken(opportunity.estimatedEffort)} />
            <Metric label="Etki" value={formatToken(opportunity.expectedImpact)} />
            <Metric label="Karmaşıklık" value={formatToken(opportunity.implementationComplexity)} />
            <Metric label="Kategori" value={formatToken(opportunity.category)} />
          </div>
          <div className="mt-4 rounded-md border border-emerald-100 bg-emerald-50/60 px-3 py-3">
            <p className="text-xs font-semibold text-emerald-900">Müşteri gözüyle</p>
            <p className="mt-2 text-sm leading-6 text-emerald-950">{opportunity.customerProblem}</p>
            <p className="mt-2 text-sm leading-6 text-emerald-950">{opportunity.customerBenefit}</p>
            <p className="mt-2 text-xs leading-5 text-emerald-900">{opportunity.businessRationale}</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-line bg-panel px-3 py-3">
              <p className="text-xs font-semibold uppercase text-muted">Geliştirici görevi</p>
              <p className="mt-2 text-sm leading-6 text-ink">{opportunity.suggestedImplementation}</p>
            </div>
            <div className="rounded-md border border-line bg-panel px-3 py-3">
              <p className="text-xs font-semibold uppercase text-muted">PM kararı</p>
              <p className="mt-2 text-sm leading-6 text-ink">{pmDecisionForOpportunity(opportunity)}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextList label="Kanıt" items={opportunity.evidence} />
            <TextList label="Kabul kriterleri" items={opportunity.acceptanceCriteria} />
          </div>
        </article>
      ))}
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${scoreClass(value)}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-xl font-semibold">{Math.round(value)}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function TextList({ items, label }: { items: string[]; label?: string }) {
  return (
    <div className="min-w-0">
      {label ? <p className="text-xs font-semibold uppercase text-muted">{label}</p> : null}
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 break-words text-sm text-ink">
          {items.slice(0, 8).map((item) => (
            <li key={item} className="[overflow-wrap:anywhere]">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">-</p>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-line bg-white px-4 py-6 text-center text-sm text-muted">{children}</div>;
}

function failedDetectorLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).passed === false)
    .map((item) => (item as Record<string, unknown>).label)
    .filter((item): item is string => typeof item === "string");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function storageUrl(path: string) {
  if (path.startsWith("/") || path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return `/storage/${path}`;
}

function dedupeOpportunities(opportunities: FinalAuditReport["opportunities"]) {
  const byKey = new Map<string, FinalAuditReport["opportunities"][number]>();
  const deduped: FinalAuditReport["opportunities"] = [];

  for (const opportunity of opportunities) {
    const key = opportunityClusterKey(opportunity);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, opportunity);
      deduped.push(opportunity);
      continue;
    }

    existing.evidence = uniqueStrings([...existing.evidence, ...opportunity.evidence]).slice(0, 12);
    existing.affectedPages = uniqueStrings([...existing.affectedPages, ...opportunity.affectedPages]).slice(0, 12);
    existing.acceptanceCriteria = uniqueStrings([...existing.acceptanceCriteria, ...opportunity.acceptanceCriteria]).slice(0, 8);
  }

  return deduped;
}

function opportunityClusterKey(opportunity: FinalAuditReport["opportunities"][number]) {
  const pages = [...opportunity.affectedPages].sort().join("|") || "audit-wide";
  const text = normalizeText([opportunity.title, opportunity.description, opportunity.category, ...opportunity.evidence].join(" "));

  return `${pages}:${findingFeatureKey(text)}`;
}

function pmDecisionForOpportunity(opportunity: FinalAuditReport["opportunities"][number]) {
  const pageScope = opportunity.affectedPages.map(formatPageType).join(", ");

  if (opportunity.category === "performance") {
    return `${pageScope} için hedeflenecek performans metriğini ve kabul edilebilir teknik borç sınırını belirle.`;
  }

  if (opportunity.category === "accessibility") {
    return `${pageScope} erişilebilirlik düzeltmesini yayın önceliğine al ve tekrar audit sonucu olmadan kapatma.`;
  }

  if (opportunity.relatedCompetitorExamples.length > 0 || opportunity.title.startsWith("Rakip açığını kapat")) {
    return `${pageScope} için rakip paterninin marka deneyimine uyarlanacak kapsamını ve başarı metriğini netleştir.`;
  }

  return `${pageScope} kapsamını, başarı metriğini ve doğrulama auditini netleştir.`;
}

function findingFeatureKey(text: string) {
  if (/(hero|vitrin|ana gorsel)/.test(text)) return "hero";
  if (/(h1|baslik|heading)/.test(text)) return "h1";
  if (/(meta description|meta aciklama)/.test(text)) return "meta-description";
  if (/(category|kategori)/.test(text)) return "category-shortcuts";
  if (/(mobile menu|mobil menu|hamburger)/.test(text)) return "mobile-menu";
  if (/(wishlist|favorite|favourite|favori|istek listesi|heart|kalp)/.test(text)) return "wishlist";
  if (/(color contrast|color-contrast|kontrast)/.test(text)) return "color-contrast";
  if (/(document title|document-title|title element)/.test(text)) return "document-title";
  if (/(landmark|main landmark)/.test(text)) return "landmark";
  if (/(server response|server-response-time|ttfb)/.test(text)) return "server-response-time";
  if (/(render-blocking|render engelleyici)/.test(text)) return "render-blocking";
  if (/(unused css|kullanilmayan css)/.test(text)) return "unused-css";

  return text
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join("-");
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function formatPageType(value: string) {
  const labels: Record<string, string> = {
    home: "Ana sayfa",
    plp: "Listeleme",
    pdp: "Ürün detay",
    search: "Arama",
    campaign: "Kampanya",
    content: "İçerik",
    unknown: "Bilinmeyen",
    "audit-wide": "Audit kapsamı"
  };

  return labels[value] ?? value.toUpperCase();
}

function scoreClass(value: number) {
  if (value >= 90) {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (value >= 50) {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-red-200 bg-red-50 text-red-800";
}

function formatToken(value: string) {
  const labels: Record<string, string> = {
    fashion: "Moda",
    electronics: "Elektronik",
    grocery: "Market",
    beauty: "Kozmetik",
    home_living: "Ev & Yaşam",
    sports: "Spor",
    marketplace: "Pazaryeri",
    other: "Diğer",
    budget: "Ekonomik",
    mid: "Orta",
    premium: "Premium",
    luxury: "Lüks",
    unknown: "Bilinmeyen",
    ux: "UX",
    ui: "UI",
    performance: "Performans",
    seo: "SEO",
    accessibility: "Erişilebilirlik",
    conversion: "Dönüşüm",
    retention: "Sadakat",
    trust: "Güven",
    frontend: "Frontend",
    analytics: "Analitik",
    content: "İçerik",
    merchandising: "Ürün Sunumu",
    low: "Düşük",
    medium: "Orta",
    high: "Yüksek",
    critical: "Kritik",
    half_day: "Yarım gün",
    "1_day": "1 gün",
    "2_3_days": "2-3 gün",
    "1_week": "1 hafta",
    "2_weeks_plus": "2+ hafta",
    discovery: "Keşif",
    evaluation: "Değerlendirme",
    purchase: "Satın alma",
    post_purchase: "Satın alma sonrası"
  };

  return (
    labels[value] ??
    value
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}
