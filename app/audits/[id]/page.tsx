import { AuditStatus, type AuditPage, type Opportunity } from "@prisma/client";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  FileText,
  Gauge,
  RefreshCw,
  ShieldAlert,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { prisma } from "@/src/lib/db/prisma";
import type { DetectorResult } from "@/src/lib/audit/ecommerce-detectors";
import type {
  AccessibilitySummary,
  LighthouseSummary,
  TechnicalAuditError
} from "@/src/lib/audit/technical-audit-normalizer";
import type { AuditScorecard } from "@/src/lib/audit/scoring";
import type { CompetitorComparison, PageUXAnalysis, SiteProfile } from "@/src/lib/ai/schemas";
import { CancelAuditButton, StartAuditButton } from "./start-audit-button";

export const dynamic = "force-dynamic";

type AuditDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type RenderablePage = {
  id: string;
  url: string;
  pageType: string;
  title: string | null;
  metaDescription: string | null;
  screenshotPath: string | null;
  mobileScreenshotPath: string | null;
  headings: unknown;
  links: unknown;
  buttons: unknown;
  forms: unknown;
  consoleErrors?: unknown;
  failedRequests?: unknown;
  detectorResults: unknown;
  lighthouse: unknown;
  accessibility: unknown;
  aiAnalysis?: unknown;
  createdAt: Date;
};

type CompetitorWithPages = {
  id: string;
  name: string | null;
  normalizedUrl: string;
  confidence: number;
  reason: string | null;
  errorMessage: string | null;
  pages: RenderablePage[];
};

type PriorityIssue = {
  title: string;
  description: string;
  meta: string;
  tone: "danger" | "warning" | "info";
};

const statusOrder: AuditStatus[] = [
  AuditStatus.QUEUED,
  AuditStatus.CRAWLING,
  AuditStatus.AUDITING,
  AuditStatus.COMPETITOR_ANALYSIS,
  AuditStatus.AI_ANALYSIS,
  AuditStatus.REPORT_READY
];

const activeStatuses = new Set<AuditStatus>([
  AuditStatus.QUEUED,
  AuditStatus.CRAWLING,
  AuditStatus.AUDITING,
  AuditStatus.COMPETITOR_ANALYSIS,
  AuditStatus.AI_ANALYSIS
]);

const pageTypeOrder = ["home", "plp", "pdp", "search", "campaign", "content", "unknown"];

export default async function AuditDetailPage({ params }: AuditDetailPageProps) {
  const { id } = await params;
  const audit = await prisma.auditProject.findUnique({
    where: {
      id
    },
    include: {
      pages: {
        orderBy: {
          createdAt: "asc"
        }
      },
      competitors: {
        include: {
          pages: {
            orderBy: {
              createdAt: "asc"
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      reports: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      },
      opportunities: {
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  if (!audit) {
    notFound();
  }

  const scorecard = getScorecard(audit.reports[0]?.scorecard);
  const siteProfile = getSiteProfile(audit.siteProfile);
  const competitorComparison = getCompetitorComparison(audit.reports[0]?.content);
  const pagesByType = groupPagesByType(audit.pages);
  const failedCheckCount = audit.pages.reduce((total, page) => total + getFailedDetectorResults(page.detectorResults).length, 0);
  const technicalIssueCount = audit.pages.reduce(
    (total, page) => total + getJsonArrayLength(page.consoleErrors) + getJsonArrayLength(page.failedRequests),
    0
  );
  const topIssues = buildPriorityIssues({
    pages: audit.pages,
    opportunities: audit.opportunities,
    competitorComparison
  });
  const isRunning = activeStatuses.has(audit.status) && Boolean(audit.activeRunId);
  const isLegacyStalled = activeStatuses.has(audit.status) && !audit.activeRunId && audit.status !== AuditStatus.QUEUED;

  return (
    <div className="space-y-6">
      <div className="border-b border-line pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <Link href="/audits" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
              <ArrowLeft aria-hidden="true" size={16} />
              Auditler
            </Link>
            <h1 className="mt-4 max-w-4xl break-words text-2xl font-semibold text-ink">
              {audit.brandName ?? audit.normalizedUrl}
            </h1>
            <p className="mt-1 break-all text-sm text-muted">{audit.normalizedUrl}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {audit.status === AuditStatus.REPORT_READY ? (
              <Link
                href={`/audits/${audit.id}/report`}
                className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-[#0c6b5e]"
              >
                <FileText aria-hidden="true" size={16} />
                Rapor
              </Link>
            ) : null}
            <Link
              href={`/audits/${audit.id}`}
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-panel"
            >
              <RefreshCw aria-hidden="true" size={16} />
              Yenile
            </Link>
            <StartAuditButton auditId={audit.id} isRunning={isRunning} />
            {isRunning ? <CancelAuditButton auditId={audit.id} /> : null}
          </div>
        </div>
      </div>

      {audit.errorMessage ? (
        <Notice tone="danger" title="Audit hata verdi" message={audit.errorMessage} />
      ) : null}

      {audit.status === AuditStatus.CANCELED ? (
        <Notice tone="info" title="Audit iptal edildi" message="Bu çalışma kullanıcı tarafından durduruldu. İstersen aynı audit'i yeniden başlatabilirsin." />
      ) : null}

      {isLegacyStalled ? (
        <Notice
          tone="warning"
          title="Bu audit eski bir çalışmadan kalmış görünüyor"
          message="Aktif run kimliği olmadığı için yeniden başlatılabilir. Yeni çalışmada eski job'ların veriyi silmesi engellenecek."
        />
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric
          icon={<BarChart3 aria-hidden="true" size={18} />}
          label="Genel skor"
          value={scorecard ? Math.round(scorecard.overall) : "-"}
          hint={scorecard ? scoreHint(scorecard.overall) : "Skor kartı henüz yok"}
        />
        <SummaryMetric
          icon={<Gauge aria-hidden="true" size={18} />}
          label="Crawl edilen sayfa"
          value={audit.pages.length}
          hint={`${formatDepth(audit.depth)} kapsam`}
        />
        <SummaryMetric
          icon={<ShieldAlert aria-hidden="true" size={18} />}
          label="Dikkat isteyen kontrol"
          value={failedCheckCount}
          hint={technicalIssueCount > 0 ? `${technicalIssueCount} eski teknik kayıt var; yeni run'da gürültü filtrelenir` : "Gürültülü üçüncü parti hatalar gösterilmiyor"}
        />
        <SummaryMetric
          icon={<Sparkles aria-hidden="true" size={18} />}
          label="Uygulanabilir fırsat"
          value={audit.opportunities.length}
          hint={audit.status === AuditStatus.REPORT_READY ? "Rapor hazır" : formatStatus(audit.status)}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <StatusSection status={audit.status} />
        <ProjectContextSection
          brandName={audit.brandName}
          industry={audit.industry}
          country={audit.country}
          createdAt={audit.createdAt}
          updatedAt={audit.updatedAt}
          siteProfile={siteProfile}
        />
      </div>

      <ScorecardSection scorecard={scorecard} />

      <PriorityIssuesSection issues={topIssues} status={audit.status} />

      <OpportunitySection opportunities={audit.opportunities} />

      <CompetitorComparisonSection competitorComparison={competitorComparison} hasCompetitors={audit.competitors.length > 0} />

      <section className="space-y-3">
        <SectionHeader
          title="Sayfa Bulguları"
          description="Ana ekranda sadece anlamlı özetler var; ekran görüntüsü, teknik metrik ve AI yorumu her sayfanın detayında."
          count={audit.pages.length}
        />

        {audit.pages.length === 0 ? (
          <EmptyState message="Henüz crawl edilmiş sayfa yok." />
        ) : (
          <div className="space-y-4">
            {pageTypeOrder
              .filter((pageType) => pagesByType.has(pageType))
              .map((pageType) => {
                const pages = pagesByType.get(pageType) ?? [];

                return (
                  <div key={pageType} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-muted">{formatPageType(pageType)}</h3>
                      <span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs font-medium text-muted">
                        {pages.length}
                      </span>
                    </div>
                    {pages.map((page) => (
                      <PageCard key={page.id} page={page} />
                    ))}
                  </div>
                );
              })}
          </div>
        )}
      </section>

      <CompetitorsSection competitors={audit.competitors} />
    </div>
  );
}

function StatusSection({ status }: { status: AuditStatus }) {
  const activeIndex = statusOrder.indexOf(status);

  return (
    <section className="rounded-md border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Çalışma Durumu</h2>
          <p className="mt-1 text-sm text-muted">{statusDescription(status)}</p>
        </div>
        <Badge label={formatStatus(status)} className={statusClass(status)} />
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {statusOrder.map((step, index) => {
          const isDone = status === AuditStatus.REPORT_READY || activeIndex >= index;
          const isActive = status === step;

          return (
            <div key={step} className={`rounded-md border px-3 py-2 ${isActive ? "border-accent bg-[#eef8f6]" : "border-line bg-panel"}`}>
              <div className="flex items-center gap-2">
                {isDone ? (
                  <CheckCircle2 aria-hidden="true" size={15} className="text-accent" />
                ) : (
                  <span className="size-[15px] rounded-full border border-line bg-white" aria-hidden="true" />
                )}
                <p className={`text-xs font-medium ${isActive ? "text-ink" : "text-muted"}`}>{formatStatus(step)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProjectContextSection({
  brandName,
  industry,
  country,
  createdAt,
  updatedAt,
  siteProfile
}: {
  brandName: string | null;
  industry: string | null;
  country: string | null;
  createdAt: Date;
  updatedAt: Date;
  siteProfile: SiteProfile | null;
}) {
  return (
    <aside className="rounded-md border border-line bg-white p-4">
      <h2 className="text-base font-semibold text-ink">Audit Bağlamı</h2>
      <dl className="mt-4 space-y-3 text-sm">
        <Detail label="Marka" value={brandName ?? "-"} />
        <Detail label="Sektör" value={siteProfile?.likelyIndustry ?? industry ?? "-"} />
        <Detail label="Ülke" value={country ?? "-"} />
        <Detail label="Hedef kitle" value={siteProfile?.targetAudience ?? "Analiz tamamlanınca netleşir"} />
        <Detail label="Oluşturulma" value={formatDate(createdAt)} />
        <Detail label="Son güncelleme" value={formatDate(updatedAt)} />
      </dl>
      {siteProfile?.mainProductCategories.length ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs font-semibold text-muted">Ürün kategorileri</p>
          <p className="mt-1 text-sm text-ink">{siteProfile.mainProductCategories.slice(0, 6).join(", ")}</p>
        </div>
      ) : null}
    </aside>
  );
}

function ScorecardSection({ scorecard }: { scorecard: AuditScorecard | null }) {
  if (!scorecard) {
    return <Notice tone="info" title="Skor kartı bekleniyor" message="Teknik audit tamamlandıktan sonra skorlar burada özetlenecek." />;
  }

  return (
    <section className="space-y-3">
      <SectionHeader title="Skor Kartı" description="Skorlar ham veriden değil, detector ve teknik audit sinyallerinin ağırlıklı özetinden gelir." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        <ScoreBadge label="Genel" value={scorecard.overall} />
        <ScoreBadge label="UX" value={scorecard.ux} />
        <ScoreBadge label="Dönüşüm" value={scorecard.conversion} />
        <ScoreBadge label="Performans" value={scorecard.performance} />
        <ScoreBadge label="SEO" value={scorecard.seo} />
        <ScoreBadge label="Erişilebilirlik" value={scorecard.accessibility} />
        <ScoreBadge label="Rakip Konumu" value={scorecard.competitorPositioning} />
      </div>
    </section>
  );
}

function PriorityIssuesSection({ issues, status }: { issues: PriorityIssue[]; status: AuditStatus }) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Öncelikli Bulgular" description="Sayfadaki ham kayıtlar yerine iş kararı için anlamlı bulgular öne çıkarılır." count={issues.length} />
      {issues.length === 0 ? (
        <EmptyState
          message={
            status === AuditStatus.REPORT_READY
              ? "Öne çıkarılacak kritik bulgu bulunamadı."
              : "Audit ilerledikçe öncelikli bulgular burada oluşacak."
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {issues.map((issue) => (
            <article key={`${issue.title}-${issue.meta}`} className={`rounded-md border bg-white p-4 ${issueToneClass(issue.tone)}`}>
              <div className="flex items-start gap-3">
                <AlertTriangle aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{issue.title}</p>
                  <p className="mt-1 text-sm text-muted">{issue.description}</p>
                  <p className="mt-3 text-xs font-medium text-muted">{issue.meta}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function OpportunitySection({ opportunities }: { opportunities: Opportunity[] }) {
  const quickWins = opportunities.filter(isQuickWinOpportunity);
  const strategicProjects = opportunities.filter(isStrategicProjectOpportunity);

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Uygulanabilir Fırsatlar"
        description="Her fırsat görev formatında tutulur: kanıt, beklenen etki, efor ve kabul kriteri birlikte görünür."
        count={opportunities.length}
      />

      {opportunities.length === 0 ? (
        <EmptyState message="Fırsatlar AI analiz ve skor kartı tamamlandıktan sonra üretilecek." />
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Hızlı kazanım" value={quickWins.length} />
            <MiniMetric label="Stratejik proje" value={strategicProjects.length} />
            <MiniMetric label="Toplam görev" value={opportunities.length} />
          </div>
          <div className="space-y-3">
            {opportunities.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const evidence = getStringArrayFromJson(opportunity.evidence);
  const affectedPages = getStringArrayFromJson(opportunity.affectedPages);
  const acceptanceCriteria = getStringArrayFromJson(opportunity.acceptanceCriteria);
  const competitorExamples = getStringArrayFromJson(opportunity.relatedCompetitorExamples);

  return (
    <article className="rounded-md border border-line bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold text-ink">{opportunity.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{opportunity.description}</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {isQuickWinOpportunity(opportunity) ? <Badge label="Hızlı kazanım" className="border-emerald-200 bg-emerald-50 text-emerald-900" /> : null}
          {isStrategicProjectOpportunity(opportunity) ? <Badge label="Stratejik" className="border-indigo-200 bg-indigo-50 text-indigo-900" /> : null}
          <Badge label={formatToken(opportunity.priority)} className={priorityClass(opportunity.priority)} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <MiniMetric label="Kategori" value={formatToken(opportunity.category)} />
        <MiniMetric label="Efor" value={formatToken(opportunity.estimatedEffort)} />
        <MiniMetric label="Etki" value={formatToken(opportunity.expectedImpact)} />
        <MiniMetric label="Karmaşıklık" value={formatToken(opportunity.implementationComplexity)} />
        <MiniMetric label="Sayfa" value={affectedPages.length} />
      </div>

      {opportunity.suggestedImplementation ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs font-semibold text-muted">Önerilen uygulama</p>
          <p className="mt-2 text-sm leading-6 text-ink">{opportunity.suggestedImplementation}</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 border-t border-line pt-3 md:grid-cols-2">
        <TextList label="Kanıt" items={evidence} />
        <TextList label="Kabul kriterleri" items={acceptanceCriteria} />
        <TextList label="Etkilenen sayfalar" items={affectedPages} />
        <TextList label="Rakip örnekleri" items={competitorExamples} />
      </div>
    </article>
  );
}

function CompetitorComparisonSection({
  competitorComparison,
  hasCompetitors
}: {
  competitorComparison: CompetitorComparison | null;
  hasCompetitors: boolean;
}) {
  if (!hasCompetitors) {
    return null;
  }

  return (
    <section className="space-y-3">
      <SectionHeader title="Rakip Karşılaştırması" description="Manuel eklenen rakiplerin ana sayfa kanıtlarıyla müşteri ana sayfası karşılaştırılır." />
      {!competitorComparison ? (
        <EmptyState message="Rakip karşılaştırması henüz üretilmedi." />
      ) : (
        <article className="rounded-md border border-line bg-white p-4">
          <p className="text-sm leading-6 text-muted">{competitorComparison.summary}</p>
          {competitorComparison.gaps.length > 0 ? (
            <div className="mt-4 space-y-3 border-t border-line pt-3">
              {competitorComparison.gaps.slice(0, 6).map((gap) => (
                <div key={`${gap.area}-${gap.recommendation}`} className="grid gap-3 lg:grid-cols-[180px_1fr]">
                  <div>
                    <p className="text-sm font-semibold text-ink">{gap.area}</p>
                    <Badge label={formatToken(gap.impact)} className={comparisonImpactClass(gap.impact)} />
                  </div>
                  <div className="space-y-2 text-sm text-muted">
                    <p>{gap.recommendation}</p>
                    <p>
                      <span className="font-medium text-ink">Mevcut durum:</span> {gap.customerCurrentState}
                    </p>
                    <p>
                      <span className="font-medium text-ink">Rakip gözlemi:</span> {gap.competitorObservation}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      )}
    </section>
  );
}

function PageCard({ page }: { page: RenderablePage }) {
  const failedDetectors = getFailedDetectorResults(page.detectorResults);
  const lighthouse = getLighthouseSummary(page.lighthouse);
  const accessibility = getAccessibilitySummary(page.accessibility);
  const aiAnalysis = getPageUXAnalysis(page.aiAnalysis);
  const consoleCount = getJsonArrayLength(page.consoleErrors);
  const failedRequestCount = getJsonArrayLength(page.failedRequests);
  const topFailed = failedDetectors.slice(0, 4);

  return (
    <article className="rounded-md border border-line bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge label={formatPageType(page.pageType)} className="border-slate-200 bg-slate-50 text-slate-700" />
            {failedDetectors.length > 0 ? (
              <Badge label={`${failedDetectors.length} kontrol`} className="border-amber-200 bg-amber-50 text-amber-900" />
            ) : (
              <Badge label="Kritik kontrol yok" className="border-emerald-200 bg-emerald-50 text-emerald-900" />
            )}
          </div>
          <h3 className="mt-2 break-words text-base font-semibold text-ink">{page.title ?? page.url}</h3>
          <p className="mt-1 break-all text-xs text-muted">{page.url}</p>
          {page.metaDescription ? <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">{page.metaDescription}</p> : null}
        </div>
        <time className="text-xs text-muted" dateTime={page.createdAt.toISOString()}>
          {formatDate(page.createdAt)}
        </time>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <MiniMetric label="H1" value={getHeadingCount(page.headings, "h1")} />
        <MiniMetric label="Link" value={getJsonArrayLength(page.links)} />
        <MiniMetric label="Buton" value={getJsonArrayLength(page.buttons)} />
        <MiniMetric label="Form" value={getJsonArrayLength(page.forms)} />
        <MiniMetric label="Konsol" value={consoleCount} />
        <MiniMetric label="Ağ" value={failedRequestCount} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        <div>
          <p className="text-xs font-semibold text-muted">Öne çıkan sayfa bulguları</p>
          {topFailed.length > 0 ? (
            <ul className="mt-2 space-y-2 text-sm text-ink">
              {topFailed.map((detector) => (
                <li key={detector.key} className="flex gap-2">
                  <AlertTriangle aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-amber-600" />
                  <span>{detectorIssueTitle(detector)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Bu sayfada öncelikli detector sorunu görünmüyor.</p>
          )}
        </div>
        <TechnicalSnapshot lighthouse={lighthouse} accessibility={accessibility} />
      </div>

      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">Sayfa detaylarını aç</summary>
        <div className="mt-4 space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <ScreenshotPreview label="Desktop ekran görüntüsü" storagePath={page.screenshotPath} />
            <ScreenshotPreview label="Mobil ekran görüntüsü" storagePath={page.mobileScreenshotPath} />
          </div>
          <DetectorDetailList detectors={failedDetectors} />
          <PageUXAnalysisPanel aiAnalysis={aiAnalysis} />
          <TechnicalDetails lighthouse={lighthouse} accessibility={accessibility} />
        </div>
      </details>
    </article>
  );
}

function TechnicalSnapshot({
  lighthouse,
  accessibility
}: {
  lighthouse: LighthouseSummary | TechnicalAuditError | null;
  accessibility: AccessibilitySummary | TechnicalAuditError | null;
}) {
  if (!lighthouse && !accessibility) {
    return <div className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-muted">Teknik sonuç bekleniyor.</div>;
  }

  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2">
      <p className="text-xs font-semibold text-muted">Teknik özet</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {lighthouse && !isTechnicalAuditError(lighthouse) ? (
          <>
            <ScorePill label="Performans" value={lighthouse.performance} />
            <ScorePill label="SEO" value={lighthouse.seo} />
          </>
        ) : null}
        {accessibility && !isTechnicalAuditError(accessibility) ? (
          <>
            <CountPill label="A11y ihlal" value={accessibility.violationCount} />
            <CountPill label="Ciddi" value={accessibility.criticalCount + accessibility.seriousCount} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function DetectorDetailList({ detectors }: { detectors: DetectorResult[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted">Dikkat isteyen kontroller</p>
      {detectors.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Gösterilecek başarısız kontrol yok.</p>
      ) : (
        <div className="mt-2 divide-y divide-line rounded-md border border-line">
          {detectors.map((detector) => (
            <div key={detector.key} className="px-3 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">{detectorIssueTitle(detector)}</p>
                  {detector.evidence.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {detector.evidence.slice(0, 3).map((item) => (
                        <li key={item}>{formatEvidence(item)}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <Badge label={formatSeverity(detector.severity)} className={severityClass(detector.severity)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PageUXAnalysisPanel({ aiAnalysis }: { aiAnalysis: PageUXAnalysis | null }) {
  if (!aiAnalysis) {
    return (
      <div>
        <p className="text-xs font-semibold text-muted">AI sayfa yorumu</p>
        <p className="mt-2 text-sm text-muted">AI sayfa analizi henüz yok.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-muted">AI sayfa yorumu</p>
          <p className="mt-2 text-sm leading-6 text-ink">{aiAnalysis.summary}</p>
        </div>
        <Badge label={`Öncelik ${Math.round(aiAnalysis.priorityScore)}`} className="border-amber-200 bg-amber-50 text-amber-900" />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <TextList label="Güçlü yanlar" items={aiAnalysis.strengths} />
        <TextList label="Zayıf alanlar" items={aiAnalysis.weaknesses} />
        <TextList label="Kaçırılmış fırsatlar" items={aiAnalysis.missedOpportunities} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TextList label="Dönüşüm bulguları" items={aiAnalysis.ecommerceFindings?.conversion ?? []} />
        <TextList label="Frontend bulguları" items={aiAnalysis.technicalFindings?.frontendQuality ?? []} />
      </div>
    </div>
  );
}

function TechnicalDetails({
  lighthouse,
  accessibility
}: {
  lighthouse: LighthouseSummary | TechnicalAuditError | null;
  accessibility: AccessibilitySummary | TechnicalAuditError | null;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <p className="text-xs font-semibold text-muted">Lighthouse</p>
        {!lighthouse ? (
          <p className="mt-2 text-sm text-muted">Sonuç yok.</p>
        ) : isTechnicalAuditError(lighthouse) ? (
          <ErrorLine message={lighthouse.error.message} />
        ) : (
          <div className="mt-2 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <ScorePill label="Performans" value={lighthouse.performance} />
              <ScorePill label="Erişilebilirlik" value={lighthouse.accessibility} />
              <ScorePill label="Best practices" value={lighthouse.bestPractices} />
              <ScorePill label="SEO" value={lighthouse.seo} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted">
              <MetricLine label="FCP" value={formatMetricMs(lighthouse.metrics.firstContentfulPaint)} />
              <MetricLine label="LCP" value={formatMetricMs(lighthouse.metrics.largestContentfulPaint)} />
              <MetricLine label="TBT" value={formatMetricMs(lighthouse.metrics.totalBlockingTime)} />
              <MetricLine label="CLS" value={formatMetricNumber(lighthouse.metrics.cumulativeLayoutShift)} />
            </div>
            <TextList label="İlk teknik fırsatlar" items={lighthouse.opportunities.slice(0, 4).map((item) => item.displayValue ? `${item.title} (${item.displayValue})` : item.title)} />
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-muted">Erişilebilirlik</p>
        {!accessibility ? (
          <p className="mt-2 text-sm text-muted">Sonuç yok.</p>
        ) : isTechnicalAuditError(accessibility) ? (
          <ErrorLine message={accessibility.error.message} />
        ) : (
          <div className="mt-2 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <CountPill label="Toplam" value={accessibility.violationCount} />
              <CountPill label="Kritik" value={accessibility.criticalCount} />
              <CountPill label="Ciddi" value={accessibility.seriousCount} />
              <CountPill label="Orta" value={accessibility.moderateCount} />
              <CountPill label="Düşük" value={accessibility.minorCount} />
            </div>
            <TextList label="İlk ihlaller" items={accessibility.violations.slice(0, 4).map((item) => item.help || item.id)} />
          </div>
        )}
      </div>
    </div>
  );
}

function CompetitorsSection({ competitors }: { competitors: CompetitorWithPages[] }) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Rakip Kayıtları" description="Rakip sayfaları özet görünür; detaylar ilgili sayfa kartında açılır." count={competitors.length} />
      {competitors.length === 0 ? (
        <EmptyState message="Bu audit için manuel rakip eklenmemiş." />
      ) : (
        <div className="space-y-4">
          {competitors.map((competitor) => (
            <article key={competitor.id} className="rounded-md border border-line bg-white p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">{competitor.name ?? competitor.normalizedUrl}</h3>
                  <p className="mt-1 break-all text-xs text-muted">{competitor.normalizedUrl}</p>
                  {competitor.reason ? <p className="mt-2 text-sm text-muted">{competitor.reason}</p> : null}
                </div>
                <Badge label={`Güven ${Math.round(competitor.confidence * 100)}%`} className="border-emerald-200 bg-emerald-50 text-emerald-900" />
              </div>

              {competitor.errorMessage ? <Notice tone="danger" title="Rakip analizi hata verdi" message={competitor.errorMessage} compact /> : null}

              {competitor.pages.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {competitor.pages.map((page) => (
                    <PageCard key={page.id} page={page} />
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">Rakip sayfası henüz crawl edilmedi.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SectionHeader({ title, description, count }: { title: string; description: string; count?: number }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      {typeof count === "number" ? (
        <span className="rounded-full border border-line bg-white px-2 py-1 text-xs font-medium text-muted">{count}</span>
      ) : null}
    </div>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
  hint
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className="text-accent">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="break-words text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function MiniMetric({ label, value }: { label: number | string; value: number | string }) {
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold text-ink">{value}</p>
    </div>
  );
}

function ScoreBadge({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={`rounded-md border px-3 py-3 ${scoreClass(value)}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value ?? "-"}</p>
    </div>
  );
}

function ScorePill({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={`rounded-md border px-2 py-2 ${scoreClass(value)}`}>
      <p className="text-[11px] font-medium">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value ?? "-"}</p>
    </div>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-white px-2 py-2 text-center">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`inline-flex w-fit items-center rounded-full border px-2 py-1 text-xs font-medium ${className}`}>{label}</span>;
}

function Notice({
  tone,
  title,
  message,
  compact = false
}: {
  tone: "danger" | "warning" | "info";
  title: string;
  message: string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-md border px-4 ${compact ? "mt-4 py-3" : "py-4"} ${noticeClass(tone)}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-sm text-muted">{message}</div>;
}

function TextList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted">{label}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm leading-6 text-ink">
          {items.slice(0, 6).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">-</p>
      )}
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-panel px-2 py-1">
      <span className="font-medium text-ink">{label}</span>: {value}
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{message}</p>;
}

function ScreenshotPreview({ label, storagePath }: { label: string; storagePath: string | null }) {
  const screenshotUrl = getStorageUrl(storagePath);

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">{label}</p>
      {screenshotUrl ? (
        <a href={screenshotUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-line bg-panel">
          <img src={screenshotUrl} alt={label} className="h-72 w-full object-cover object-top" />
        </a>
      ) : (
        <div className="flex h-72 items-center justify-center rounded-md border border-line bg-panel text-sm text-muted">
          Ekran görüntüsü yok
        </div>
      )}
    </div>
  );
}

function buildPriorityIssues({
  pages,
  opportunities,
  competitorComparison
}: {
  pages: AuditPage[];
  opportunities: Opportunity[];
  competitorComparison: CompetitorComparison | null;
}) {
  const issues: PriorityIssue[] = [];

  for (const opportunity of opportunities.filter((item) => item.priority === "critical" || item.priority === "high").slice(0, 4)) {
    issues.push({
      title: opportunity.title,
      description: opportunity.description,
      meta: `${formatToken(opportunity.priority)} öncelik · ${formatToken(opportunity.category)}`,
      tone: opportunity.priority === "critical" ? "danger" : "warning"
    });
  }

  for (const page of pages) {
    for (const detector of getFailedDetectorResults(page.detectorResults).filter((item) => item.severity === "high").slice(0, 2)) {
      issues.push({
        title: detectorIssueTitle(detector),
        description: detectorIssueDescription(detector, page.pageType),
        meta: `${formatPageType(page.pageType)} · ${formatSeverity(detector.severity)}`,
        tone: "warning"
      });
    }
  }

  for (const gap of competitorComparison?.gaps.filter((item) => item.impact === "high").slice(0, 2) ?? []) {
    issues.push({
      title: `Rakip açığı: ${gap.area}`,
      description: gap.recommendation,
      meta: "Rakip karşılaştırması",
      tone: "info"
    });
  }

  return dedupeIssues(issues).slice(0, 6);
}

function detectorIssueTitle(detector: DetectorResult) {
  const labels: Record<string, string> = {
    homepage_has_hero: "Ana sayfada hero alanı ve ana aksiyon zayıf",
    homepage_has_h1: "Ana sayfada H1 başlığı eksik",
    homepage_has_category_shortcuts: "Kategori kısayolları yetersiz",
    homepage_has_mobile_menu_signal: "Mobil menü sinyali zayıf",
    technical_has_h1: "H1 başlığı eksik",
    technical_has_meta_description: "Meta açıklama eksik",
    technical_images_have_alt: "Görsel alt metinleri eksik",
    technical_buttons_have_accessible_name: "Bazı butonların erişilebilir adı yok",
    technical_links_have_text: "Bazı linklerde anlaşılır metin yok",
    technical_no_console_errors: "Konsolda incelenmesi gereken hata var",
    technical_no_failed_requests: "Kritik ağ isteği hataları var",
    technical_dom_text_not_excessive: "Sayfa metin hacmi aşırı yüksek",
    technical_external_script_count_reasonable: "Harici script sayısı yüksek",
    technical_form_fields_have_labels: "Form alanlarında label/placeholder eksikleri var",
    pdp_has_product_title: "Ürün başlığı eksik",
    pdp_has_price: "Ürün fiyatı algılanamadı",
    pdp_has_size_guide: "Beden/ölçü rehberi eksik",
    pdp_has_related_products: "Benzer ürün önerileri eksik",
    pdp_has_sticky_add_to_cart: "Sabit sepete ekle sinyali yok",
    plp_has_product_grid: "Ürün grid yapısı zayıf",
    plp_has_price_text: "Listeleme fiyat bilgisi zayıf",
    plp_has_filter: "Filtreleme sinyali eksik",
    plp_has_sort: "Sıralama sinyali eksik"
  };

  return labels[detector.key] ?? detector.label;
}

function detectorIssueDescription(detector: DetectorResult, pageType: string) {
  if (detector.key === "technical_no_console_errors") {
    return "Konsol kayıtlarında incelenmesi gereken hata görüldü.";
  }

  if (detector.key === "technical_no_failed_requests") {
    return "Ağ kayıtlarında başarısız istek görüldü.";
  }

  const evidence = detector.evidence[0] ? formatEvidence(detector.evidence[0]) : null;

  return evidence ?? `${formatPageContext(pageType)} ilgili kontrol geçmedi.`;
}

function formatEvidence(value: string) {
  return value
    .replace(/^Price-like texts:/, "Fiyat benzeri metin sayısı:")
    .replace(/^Images without alt:/, "Alt metni olmayan görsel sayısı:")
    .replace(/^Buttons without name:/, "Erişilebilir adı olmayan buton sayısı:")
    .replace(/^Links without text:/, "Metinsiz link sayısı:")
    .replace(/^Visible text length:/, "Görünen metin uzunluğu:")
    .replace(/^External scripts:/, "Harici script sayısı:")
    .replace(/^Unlabeled fields:/, "Etiketsiz form alanı sayısı:")
    .replace(/^Category-like links:/, "Kategori benzeri link sayısı:")
    .replace(/^Field:/, "Alan:")
    .replace(/^Button:/, "Buton:")
    .replace(/^Matched:/, "Eşleşen ifade:");
}

function formatPageContext(pageType: string) {
  const labels: Record<string, string> = {
    home: "Ana sayfada",
    plp: "Listeleme sayfasında",
    pdp: "Ürün detay sayfasında",
    search: "Arama sayfasında",
    campaign: "Kampanya sayfasında",
    content: "İçerik sayfasında",
    unknown: "Bu sayfada"
  };

  return labels[pageType] ?? "Bu sayfada";
}

function dedupeIssues(issues: PriorityIssue[]) {
  const seen = new Set<string>();
  const result: PriorityIssue[] = [];

  for (const issue of issues) {
    const key = issue.title.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(issue);
  }

  return result;
}

function getStorageUrl(storagePath: string | null) {
  if (!storagePath) {
    return null;
  }

  if (storagePath.startsWith("/") || storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return storagePath;
  }

  const prefix = (process.env.LOCAL_STORAGE_PUBLIC_URL_PREFIX ?? "/storage").replace(/\/$/, "");
  return `${prefix}/${storagePath}`;
}

function getJsonArrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function getStringArrayFromJson(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getHeadingCount(value: unknown, key: "h1" | "h2" | "h3") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }

  const headings = value as Record<string, unknown>;
  return Array.isArray(headings[key]) ? headings[key].length : 0;
}

function getScorecard(value: unknown): AuditScorecard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const keys: Array<keyof AuditScorecard> = [
    "ux",
    "performance",
    "seo",
    "accessibility",
    "conversion",
    "competitorPositioning",
    "overall"
  ];

  if (!keys.every((key) => typeof candidate[key] === "number")) {
    return null;
  }

  return candidate as AuditScorecard;
}

function getSiteProfile(value: unknown): SiteProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.likelyIndustry !== "string" ||
    typeof candidate.ecommerceType !== "string" ||
    typeof candidate.targetAudience !== "string" ||
    typeof candidate.confidence !== "number" ||
    !Array.isArray(candidate.mainProductCategories) ||
    !Array.isArray(candidate.reasoning)
  ) {
    return null;
  }

  return candidate as SiteProfile;
}

function getPageUXAnalysis(value: unknown): PageUXAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.pageType !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.priorityScore !== "number" ||
    !Array.isArray(candidate.strengths) ||
    !Array.isArray(candidate.weaknesses) ||
    !Array.isArray(candidate.missedOpportunities)
  ) {
    return null;
  }

  return candidate as PageUXAnalysis;
}

function getCompetitorComparison(value: unknown): CompetitorComparison | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const content = value as Record<string, unknown>;
  const candidate = content.competitorComparison;

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const comparison = candidate as Record<string, unknown>;

  if (
    typeof comparison.summary !== "string" ||
    !isStringArray(comparison.customerAdvantages) ||
    !isStringArray(comparison.competitorAdvantages) ||
    !Array.isArray(comparison.gaps) ||
    !comparison.gaps.every(isCompetitorGap)
  ) {
    return null;
  }

  return candidate as CompetitorComparison;
}

function isCompetitorGap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.area === "string" &&
    typeof candidate.customerCurrentState === "string" &&
    typeof candidate.competitorObservation === "string" &&
    typeof candidate.recommendation === "string" &&
    (candidate.impact === "low" || candidate.impact === "medium" || candidate.impact === "high") &&
    isStringArray(candidate.evidence)
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function getLighthouseSummary(value: unknown): LighthouseSummary | TechnicalAuditError | null {
  if (isTechnicalAuditError(value) || isLighthouseSummary(value)) {
    return value;
  }

  return null;
}

function getAccessibilitySummary(value: unknown): AccessibilitySummary | TechnicalAuditError | null {
  if (isTechnicalAuditError(value) || isAccessibilitySummary(value)) {
    return value;
  }

  return null;
}

function getFailedDetectorResults(value: unknown): DetectorResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isDetectorResult).filter((detector) => !detector.passed && detector.severity !== "info").sort(sortDetectorBySeverity);
}

function isDetectorResult(value: unknown): value is DetectorResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.key === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.passed === "boolean" &&
    typeof candidate.confidence === "number" &&
    (candidate.severity === "info" || candidate.severity === "low" || candidate.severity === "medium" || candidate.severity === "high") &&
    Array.isArray(candidate.evidence)
  );
}

function isTechnicalAuditError(value: unknown): value is TechnicalAuditError {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const error = candidate.error as Record<string, unknown> | undefined;

  return Boolean(error && typeof error.message === "string" && typeof error.source === "string");
}

function isLighthouseSummary(value: unknown): value is LighthouseSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.url === "string" &&
    typeof candidate.metrics === "object" &&
    Array.isArray(candidate.opportunities) &&
    Array.isArray(candidate.diagnostics)
  );
}

function isAccessibilitySummary(value: unknown): value is AccessibilitySummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return typeof candidate.violationCount === "number" && Array.isArray(candidate.violations);
}

function groupPagesByType(pages: AuditPage[]) {
  const groupedPages = new Map<string, AuditPage[]>();

  for (const page of pages) {
    const existingPages = groupedPages.get(page.pageType) ?? [];
    existingPages.push(page);
    groupedPages.set(page.pageType, existingPages);
  }

  return groupedPages;
}

function sortDetectorBySeverity(left: DetectorResult, right: DetectorResult) {
  return severityRank(right.severity) - severityRank(left.severity);
}

function severityRank(severity: DetectorResult["severity"]) {
  return severity === "high" ? 3 : severity === "medium" ? 2 : severity === "low" ? 1 : 0;
}

function formatStatus(status: AuditStatus) {
  const labels: Record<AuditStatus, string> = {
    QUEUED: "Sırada",
    CRAWLING: "Crawl",
    AUDITING: "Teknik Audit",
    COMPETITOR_ANALYSIS: "Rakip Analizi",
    AI_ANALYSIS: "AI Analizi",
    REPORT_READY: "Rapor Hazır",
    FAILED: "Hata",
    CANCELED: "İptal Edildi"
  };

  return labels[status];
}

function statusDescription(status: AuditStatus) {
  const descriptions: Record<AuditStatus, string> = {
    QUEUED: "Audit kuyruğa alındı.",
    CRAWLING: "Site sayfaları ve ekran görüntüleri toplanıyor.",
    AUDITING: "Lighthouse, erişilebilirlik ve detector kontrolleri çalışıyor.",
    COMPETITOR_ANALYSIS: "Manuel rakip sayfaları analiz ediliyor.",
    AI_ANALYSIS: "AI site profili, fırsatlar ve rapor içeriği üretiyor.",
    REPORT_READY: "Audit tamamlandı, rapor görüntülenebilir.",
    FAILED: "Audit tamamlanmadan hata verdi.",
    CANCELED: "Audit kullanıcı tarafından iptal edildi."
  };

  return descriptions[status];
}

function formatDepth(depth: string) {
  const labels: Record<string, string> = {
    QUICK: "Hızlı",
    STANDARD: "Standart",
    DEEP: "Derin"
  };

  return labels[depth] ?? depth;
}

function formatPageType(pageType: string) {
  const labels: Record<string, string> = {
    home: "Ana sayfa",
    plp: "Listeleme",
    pdp: "Ürün detay",
    search: "Arama",
    campaign: "Kampanya",
    content: "İçerik",
    unknown: "Bilinmeyen"
  };

  return labels[pageType] ?? pageType.toUpperCase();
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatMetricMs(value?: number) {
  if (typeof value !== "number") {
    return "-";
  }

  return `${Math.round(value)} ms`;
}

function formatMetricNumber(value?: number) {
  if (typeof value !== "number") {
    return "-";
  }

  return value.toFixed(3);
}

function formatSeverity(severity: DetectorResult["severity"]) {
  const labels: Record<DetectorResult["severity"], string> = {
    info: "Bilgi",
    low: "Düşük",
    medium: "Orta",
    high: "Yüksek"
  };

  return labels[severity];
}

function formatToken(value: string) {
  const labels: Record<string, string> = {
    ux: "UX",
    ui: "UI",
    performance: "Performans",
    seo: "SEO",
    accessibility: "Erişilebilirlik",
    conversion: "Dönüşüm",
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
    "2_weeks_plus": "2+ hafta"
  };

  return labels[value] ?? value;
}

function scoreHint(value: number) {
  if (value >= 85) {
    return "Güçlü";
  }

  if (value >= 65) {
    return "İyileştirilebilir";
  }

  return "Öncelikli çalışma gerekir";
}

function scoreClass(value: number | null) {
  if (value === null) {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  if (value >= 90) {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (value >= 50) {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-red-200 bg-red-50 text-red-800";
}

function statusClass(status: AuditStatus) {
  if (status === AuditStatus.REPORT_READY) {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (status === AuditStatus.FAILED) {
    return "border-red-200 bg-red-50 text-red-900";
  }

  if (status === AuditStatus.CANCELED) {
    return "border-slate-300 bg-slate-100 text-slate-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-900";
}

function priorityClass(priority: string) {
  if (priority === "critical") {
    return "border-red-300 bg-red-50 text-red-900";
  }

  if (priority === "high") {
    return "border-orange-200 bg-orange-50 text-orange-900";
  }

  if (priority === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-sky-200 bg-sky-50 text-sky-800";
}

function comparisonImpactClass(impact: CompetitorComparison["gaps"][number]["impact"]) {
  if (impact === "high") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (impact === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-sky-200 bg-sky-50 text-sky-800";
}

function severityClass(severity: DetectorResult["severity"]) {
  if (severity === "high") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (severity === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (severity === "low") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function issueToneClass(tone: PriorityIssue["tone"]) {
  if (tone === "danger") {
    return "border-red-200 text-red-900";
  }

  if (tone === "warning") {
    return "border-amber-200 text-amber-900";
  }

  return "border-sky-200 text-sky-900";
}

function noticeClass(tone: "danger" | "warning" | "info") {
  if (tone === "danger") {
    return "border-red-200 bg-red-50 text-red-900";
  }

  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-sky-200 bg-sky-50 text-sky-900";
}

function isQuickWinOpportunity(opportunity: Pick<Opportunity, "estimatedEffort" | "expectedImpact" | "implementationComplexity">) {
  return (
    (opportunity.estimatedEffort === "half_day" || opportunity.estimatedEffort === "1_day") &&
    (opportunity.expectedImpact === "medium" || opportunity.expectedImpact === "high") &&
    (opportunity.implementationComplexity === "low" || opportunity.implementationComplexity === "medium")
  );
}

function isStrategicProjectOpportunity(opportunity: Pick<Opportunity, "estimatedEffort" | "expectedImpact" | "implementationComplexity">) {
  return (
    (opportunity.estimatedEffort === "1_week" || opportunity.estimatedEffort === "2_weeks_plus") &&
    opportunity.expectedImpact === "high" &&
    (opportunity.implementationComplexity === "medium" || opportunity.implementationComplexity === "high")
  );
}
