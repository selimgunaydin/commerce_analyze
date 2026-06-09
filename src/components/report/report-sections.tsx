import type { AuditPage } from "@prisma/client";
import type { ReactNode } from "react";
import type { CompetitorComparison, FinalAuditReport } from "@/src/lib/ai/schemas";
import { Badge, EmptyState, MetricCard, MiniStat, ScoreGrid, ScoreTile, SectionHeader, TextList, priorityTone } from "@/src/components/ui/audit-kit";
import {
  bestPracticesForOpportunity,
  failedDetectorLabels,
  formatPageType,
  formatToken,
  pmDecisionForOpportunity,
  screenshotEvidenceForOpportunity,
  screenshotObjectPosition,
  storageUrl,
  technicalSummaryItems,
  visualFocusForOpportunity
} from "./report-utils";

export function ReportHero({
  finalReport,
  actions
}: {
  finalReport: FinalAuditReport;
  actions: ReactNode;
}) {
  const score = Math.round(finalReport.scorecard.overall);

  return (
    <section className="border-b border-line pb-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-muted">Entysa E-Commerce Audit Raporu</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">Ajans fırsat skoru {score}</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">{finalReport.executiveSummary}</p>
        </div>
        {actions}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <MetricCard label="Toplam görev" value={finalReport.opportunities.length} hint="Satış ve üretim backlog'u" tone="accent" />
        <MetricCard label="Hızlı kazanım" value={finalReport.quickWins.length} hint="İlk teklif sprinti" tone="good" />
        <MetricCard label="Stratejik proje" value={finalReport.strategicProjects.length} hint="Retainer / roadmap adayı" tone="warning" />
        <MetricCard label="Kanıt görseli" value={finalReport.technicalAppendix.screenshots.length} hint="Desktop + mobil doğrulama" />
      </div>
    </section>
  );
}

export function ExecutiveSummarySection({ finalReport }: { finalReport: FinalAuditReport }) {
  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow="Ajans notu"
        title="Yönetici Özeti"
        description="Müşteriye sunulacak hikaye, skorun arkasındaki iş fırsatı ve ilk teklif kapsamı."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-sm leading-7 text-ink">{finalReport.executiveSummary}</p>
          <TextList items={finalReport.topFindings} label="Öne çıkan bulgular" />
        </div>
        <div className="rounded-md border border-line bg-panel p-4">
          <p className="text-sm font-semibold text-ink">Satış açısı</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            İlk görüşmede hızlı kazanımları düşük riskli başlangıç paketi, stratejik işleri ise büyüme roadmap'i olarak konumlandır.
          </p>
          <div className="mt-4 grid gap-2">
            <MiniStat label="Keşif aşaması" value={finalReport.opportunities.filter((item) => item.customerJourneyStage === "discovery").length} />
            <MiniStat label="Satın alma aşaması" value={finalReport.opportunities.filter((item) => item.customerJourneyStage === "purchase").length} />
            <MiniStat label="Güven / sadakat" value={finalReport.opportunities.filter((item) => item.category === "trust" || item.category === "retention").length} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function SiteProfileSection({ finalReport }: { finalReport: FinalAuditReport }) {
  return (
    <section className="space-y-4">
      <SectionHeader title="Site Profili" description="Analizin hangi marka, kategori ve müşteri bağlamında okunduğunu gösterir." />
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Sektör" value={finalReport.siteProfile.likelyIndustry} />
        <MetricCard label="Tip" value={formatToken(finalReport.siteProfile.ecommerceType)} />
        <MetricCard label="Güven" value={`${Math.round(finalReport.siteProfile.confidence * 100)}%`} />
      </div>
      <p className="text-sm leading-6 text-muted">
        Hedef kitle: {finalReport.siteProfile.targetAudience}. Fiyat konumu: {formatToken(finalReport.siteProfile.pricePositioning)}.
      </p>
    </section>
  );
}

export function ScorecardSection({ finalReport }: { finalReport: FinalAuditReport }) {
  return (
    <section className="space-y-4">
      <SectionHeader title="Skor Kartı" description="Ajansın teklif önceliği için okunur: düşük skor satış fırsatı, yüksek skor korunacak varlık demektir." />
      <ScoreGrid>
        <ScoreTile label="Genel" value={finalReport.scorecard.overall} />
        <ScoreTile label="UX" value={finalReport.scorecard.ux} />
        <ScoreTile label="Dönüşüm" value={finalReport.scorecard.conversion} />
        <ScoreTile label="Performans" value={finalReport.scorecard.performance} />
        <ScoreTile label="SEO" value={finalReport.scorecard.seo} />
        <ScoreTile label="Erişilebilirlik" value={finalReport.scorecard.accessibility} />
        <ScoreTile label="Rakipler" value={finalReport.scorecard.competitorPositioning} />
      </ScoreGrid>
    </section>
  );
}

export function CompetitorSection({
  competitorComparison
}: {
  competitorComparison: CompetitorComparison | null;
}) {
  return (
    <section className="space-y-4">
      <SectionHeader title="Rakip Özeti" description="Sadece müşteride olmayan, rakipte kanıtlı olan farklar iş fırsatı olarak ele alınır." count={competitorComparison?.gaps.length ?? 0} />
      <div className="rounded-md border border-line bg-white p-4">
        <p className="text-sm leading-6 text-muted">{competitorComparison?.summary ?? "Bu rapor için manuel rakip karşılaştırması bulunmuyor."}</p>
        {competitorComparison?.gaps.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {competitorComparison.gaps.slice(0, 6).map((gap) => (
              <article key={`${gap.area}-${gap.recommendation}`} className="rounded-md border border-line bg-panel p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">{gap.area}</p>
                  <Badge tone={gap.impact === "high" ? "danger" : gap.impact === "medium" ? "warning" : "info"}>{formatToken(gap.impact)}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">{gap.recommendation}</p>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function CustomerLensSection({ opportunities }: { opportunities: FinalAuditReport["opportunities"] }) {
  if (opportunities.length === 0) {
    return (
      <section className="space-y-4">
        <SectionHeader title="Müşteri Gözüyle İçgörüler" />
        <EmptyState>Müşteri perspektifi içgörüsü yok.</EmptyState>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <SectionHeader title="Müşteri Gözüyle İçgörüler" description="Teknik bulguların alışveriş davranışına çevrilmiş hali." />
      <div className="grid gap-3 md:grid-cols-2">
        {opportunities.slice(0, 6).map((opportunity) => (
          <article key={`${opportunity.title}-customer-lens`} className="rounded-md border border-line bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="good">{formatToken(opportunity.customerJourneyStage)}</Badge>
              <Badge>{formatToken(opportunity.category)}</Badge>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-ink">{opportunity.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{opportunity.customerProblem}</p>
            <p className="mt-2 text-sm leading-6 text-ink">{opportunity.customerBenefit}</p>
            <p className="mt-2 text-xs leading-5 text-muted">{opportunity.businessRationale}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function RoadmapSection({
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

  return (
    <section className="space-y-4">
      <SectionHeader title="Öncelikli Yol Haritası" description="Ajans teklifine dönüşebilecek ilk iş paketleri." count={items.length} />
      {items.length === 0 ? (
        <EmptyState>Öncelikli görev yok.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map(({ label, opportunity }) => (
            <article key={`${label}-${opportunity.title}`} className="rounded-md border border-line bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={label === "Hızlı kazanım" ? "good" : "accent"}>{label}</Badge>
                <Badge tone={priorityTone(opportunity.priority)}>{formatToken(opportunity.priority)}</Badge>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-ink">{opportunity.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                {formatToken(opportunity.estimatedEffort)} efor · {formatToken(opportunity.expectedImpact)} etki · {formatToken(opportunity.category)}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function PageFindingsSection({ pages, title }: { pages: AuditPage[]; title: string }) {
  return (
    <section className="space-y-4">
      <SectionHeader title={title} count={pages.length} />
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
        <EmptyState>Bu tipte crawl edilmiş sayfa yok.</EmptyState>
      )}
    </section>
  );
}

export function TechnicalAuditSection({ kind, pages, title }: { kind: "performance" | "seo" | "accessibility"; pages: AuditPage[]; title: string }) {
  return (
    <section className="space-y-4">
      <SectionHeader title={title} />
      <div className="rounded-md border border-line bg-white p-4">
        <TextList items={technicalSummaryItems(kind, pages)} />
      </div>
    </section>
  );
}

export function OpportunityListSection({
  opportunities,
  screenshots
}: {
  opportunities: FinalAuditReport["opportunities"];
  screenshots: string[];
}) {
  return (
    <section className="space-y-4">
      <SectionHeader title="Tam Görev Listesi" description="Developer, PM ve satış görüşmesi için aynı görev kartı üzerinden konuşulacak şekilde düzenlendi." count={opportunities.length} />
      {opportunities.length === 0 ? (
        <EmptyState>Bu bölümde görev yok.</EmptyState>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opportunity) => (
            <article key={opportunity.title} className="rounded-md border border-line bg-white p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-ink">{opportunity.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{opportunity.description}</p>
                </div>
                <Badge tone={priorityTone(opportunity.priority)}>{formatToken(opportunity.priority)}</Badge>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <MiniStat label="Efor" value={formatToken(opportunity.estimatedEffort)} />
                <MiniStat label="Etki" value={formatToken(opportunity.expectedImpact)} />
                <MiniStat label="Karmaşıklık" value={formatToken(opportunity.implementationComplexity)} />
                <MiniStat label="Kategori" value={formatToken(opportunity.category)} />
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
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <ScreenshotEvidence opportunity={opportunity} screenshots={screenshots} />
                <TextList label="Best practice" items={bestPracticesForOpportunity(opportunity)} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function ScreenshotGallery({ screenshots }: { screenshots: string[] }) {
  return (
    <section className="space-y-4">
      <SectionHeader title="Kanıt Ekran Görüntüleri" count={screenshots.length} />
      {screenshots.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {screenshots.slice(0, 8).map((screenshot) => (
            <a key={screenshot} href={storageUrl(screenshot)} target="_blank" rel="noreferrer" className="block">
              <img src={storageUrl(screenshot)} alt="Audit ekran görüntüsü kanıtı" className="h-80 w-full rounded-md border border-line object-cover object-top" />
            </a>
          ))}
        </div>
      ) : (
        <EmptyState>Ekran görüntüsü kanıtı yok.</EmptyState>
      )}
    </section>
  );
}

export function TechnicalAppendixSection({ finalReport }: { finalReport: FinalAuditReport }) {
  return (
    <section className="space-y-4">
      <SectionHeader title="Teknik Ek" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-line bg-white p-4">
          <TextList label="Crawl edilen sayfalar" items={finalReport.technicalAppendix.crawledPages} limit={12} />
        </div>
        <div className="rounded-md border border-line bg-white p-4">
          <TextList label="Ekran görüntüleri" items={finalReport.technicalAppendix.screenshots} limit={12} />
        </div>
      </div>
    </section>
  );
}

function ScreenshotEvidence({
  opportunity,
  screenshots
}: {
  opportunity: FinalAuditReport["opportunities"][number];
  screenshots: string[];
}) {
  const matched = screenshotEvidenceForOpportunity(opportunity, screenshots);
  const focus = visualFocusForOpportunity(opportunity);

  if (matched.length === 0) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase text-muted">Ekran görüntüsü / odak alanı</p>
        <p className="mt-2 text-sm leading-6 text-muted">{focus} için ekran görüntüsü kanıtı yok.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted">Ekran görüntüsü / odak alanı</p>
      <p className="mt-2 text-sm leading-6 text-ink">{focus}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {matched.map((screenshot) => (
          <a key={`${opportunity.title}-${screenshot}`} href={storageUrl(screenshot)} target="_blank" rel="noreferrer" className="block">
            <img
              src={storageUrl(screenshot)}
              alt={`${focus} ekran görüntüsü`}
              className={`h-40 w-full rounded-md border border-line object-cover ${screenshotObjectPosition(opportunity)}`}
            />
          </a>
        ))}
      </div>
    </div>
  );
}
