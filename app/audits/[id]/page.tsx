import { AuditStatus, type AuditPage, type Opportunity } from "@prisma/client";
import { ArrowLeft, FileText, RefreshCw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/lib/db/prisma";
import type { DetectorResult } from "@/src/lib/audit/ecommerce-detectors";
import type {
  AccessibilitySummary,
  LighthouseSummary,
  TechnicalAuditError
} from "@/src/lib/audit/technical-audit-normalizer";
import type { AuditScorecard } from "@/src/lib/audit/scoring";
import type { CompetitorComparison, PageUXAnalysis, SiteProfile } from "@/src/lib/ai/schemas";
import { StartAuditButton } from "./start-audit-button";

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

const statusOrder: AuditStatus[] = [
  AuditStatus.QUEUED,
  AuditStatus.CRAWLING,
  AuditStatus.AUDITING,
  AuditStatus.COMPETITOR_ANALYSIS,
  AuditStatus.AI_ANALYSIS,
  AuditStatus.REPORT_READY
];

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

  const activeIndex = statusOrder.indexOf(audit.status);
  const pagesByType = groupPagesByType(audit.pages);
  const scorecard = getScorecard(audit.reports[0]?.scorecard);
  const siteProfile = getSiteProfile(audit.siteProfile);
  const competitorComparison = getCompetitorComparison(audit.reports[0]?.content);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/audits" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
            <ArrowLeft aria-hidden="true" size={16} />
            Audits
          </Link>
          <h1 className="mt-4 max-w-3xl break-words text-2xl font-semibold text-ink">
            {audit.brandName ?? audit.normalizedUrl}
          </h1>
          <p className="mt-1 break-all text-sm text-muted">{audit.normalizedUrl}</p>
        </div>
        <div className="flex items-center gap-2">
          {audit.status === AuditStatus.REPORT_READY ? (
            <Link
              href={`/audits/${audit.id}/report`}
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-[#0c6b5e]"
            >
              <FileText aria-hidden="true" size={16} />
              Report
            </Link>
          ) : null}
          <Link
            href={`/audits/${audit.id}`}
            className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-panel"
          >
            <RefreshCw aria-hidden="true" size={16} />
            Refresh
          </Link>
          <StartAuditButton auditId={audit.id} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="text-base font-semibold text-ink">Status timeline</h2>
          <div className="mt-4 space-y-3">
            {statusOrder.map((status, index) => {
              const isDone = activeIndex >= index || audit.status === AuditStatus.REPORT_READY;
              const isActive = audit.status === status;

              return (
                <div key={status} className="flex items-center gap-3">
                  <span
                    className={`flex size-7 items-center justify-center rounded-full border text-xs font-semibold ${
                      isDone ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-line bg-panel text-muted"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className={`text-sm font-medium ${isActive ? "text-ink" : "text-muted"}`}>{formatStatus(status)}</p>
                    {isActive ? <p className="text-xs text-muted">Current status</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="rounded-md border border-line bg-white p-4">
          <h2 className="text-base font-semibold text-ink">Audit details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Detail label="Status" value={formatStatus(audit.status)} />
            <Detail label="Depth" value={audit.depth} />
            <Detail label="Brand" value={audit.brandName ?? "-"} />
            <Detail label="Industry" value={audit.industry ?? "-"} />
            <Detail label="Country" value={audit.country ?? "-"} />
            <Detail label="Created" value={formatDate(audit.createdAt)} />
            <Detail label="Updated" value={formatDate(audit.updatedAt)} />
          </dl>
          {audit.errorMessage ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {audit.errorMessage}
            </div>
          ) : null}
        </aside>
      </div>

      <SiteProfileSection siteProfile={siteProfile} />

      <ScorecardSection scorecard={scorecard} />

      <CompetitorComparisonSection
        competitorComparison={competitorComparison}
        hasCompetitors={audit.competitors.length > 0}
      />

      <OpportunitySection opportunities={audit.opportunities} />

      <section className="space-y-3">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Crawled pages</h2>
            <p className="mt-1 text-sm text-muted">Discovered and crawled pages grouped by page type.</p>
          </div>
          <span className="rounded-full border border-line bg-white px-2 py-1 text-xs font-medium text-muted">
            {audit.pages.length}
          </span>
        </div>

        {audit.pages.length === 0 ? (
          <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-sm text-muted">
            No pages have been crawled yet.
          </div>
        ) : (
          <div className="space-y-4">
            {pageTypeOrder
              .filter((pageType) => pagesByType.has(pageType))
              .map((pageType) => {
                const pages = pagesByType.get(pageType) ?? [];

                return (
                  <div key={pageType} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold uppercase text-muted">{pageType}</h3>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="break-words text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function PageCard({ page, showIssueSummaries = true }: { page: RenderablePage; showIssueSummaries?: boolean }) {
  return (
    <article className="rounded-md border border-line bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-muted">{page.pageType}</p>
          <h3 className="mt-1 break-words text-base font-semibold text-ink">{page.title ?? page.url}</h3>
          <p className="mt-1 break-all text-xs text-muted">{page.url}</p>
          {page.metaDescription ? <p className="mt-3 max-w-3xl text-sm text-muted">{page.metaDescription}</p> : null}
        </div>
        <time className="text-xs text-muted" dateTime={page.createdAt.toISOString()}>
          {formatDate(page.createdAt)}
        </time>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <MiniMetric label="H1" value={getHeadingCount(page.headings, "h1")} />
        <MiniMetric label="Links" value={getJsonArrayLength(page.links)} />
        <MiniMetric label="Buttons" value={getJsonArrayLength(page.buttons)} />
        <MiniMetric label="Forms" value={getJsonArrayLength(page.forms)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ScreenshotPreview label="Desktop" storagePath={page.screenshotPath} />
        <ScreenshotPreview label="Mobile" storagePath={page.mobileScreenshotPath} />
      </div>

      {showIssueSummaries ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <IssueSummary label="Console errors" value={getJsonArrayLength(page.consoleErrors)} />
          <IssueSummary label="Failed requests" value={getJsonArrayLength(page.failedRequests)} />
        </div>
      ) : null}

      <TechnicalAuditPanel lighthouse={getLighthouseSummary(page.lighthouse)} accessibility={getAccessibilitySummary(page.accessibility)} />

      <DetectorResultsPanel detectorResults={getDetectorResults(page.detectorResults)} />

      <PageUXAnalysisPanel aiAnalysis={getPageUXAnalysis(page.aiAnalysis)} />
    </article>
  );
}

function CompetitorsSection({ competitors }: { competitors: CompetitorWithPages[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Competitors</h2>
          <p className="mt-1 text-sm text-muted">Manual competitor homepage audits.</p>
        </div>
        <span className="rounded-full border border-line bg-white px-2 py-1 text-xs font-medium text-muted">
          {competitors.length}
        </span>
      </div>

      {competitors.length === 0 ? (
        <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-sm text-muted">
          No manual competitors were added for this audit.
        </div>
      ) : (
        <div className="space-y-4">
          {competitors.map((competitor) => (
            <article key={competitor.id} className="rounded-md border border-line bg-white p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">{competitor.name ?? competitor.normalizedUrl}</h3>
                  <p className="mt-1 break-all text-xs text-muted">{competitor.normalizedUrl}</p>
                  {competitor.reason ? <p className="mt-2 text-xs text-muted">{competitor.reason}</p> : null}
                </div>
                <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900">
                  Confidence {Math.round(competitor.confidence * 100)}%
                </span>
              </div>

              {competitor.errorMessage ? (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {competitor.errorMessage}
                </div>
              ) : null}

              {competitor.pages.length === 0 ? (
                <div className="mt-4 rounded-md border border-line bg-panel px-3 py-6 text-center text-sm text-muted">
                  No competitor pages have been crawled yet.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {competitor.pages.map((page) => (
                    <PageCard key={page.id} page={page} showIssueSummaries={false} />
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CompetitorComparisonSection({
  competitorComparison,
  hasCompetitors
}: {
  competitorComparison: CompetitorComparison | null;
  hasCompetitors: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="border-b border-line pb-3">
        <h2 className="text-base font-semibold text-ink">Competitor comparison</h2>
        <p className="mt-1 text-sm text-muted">Customer homepage gaps compared with manual competitor homepage evidence.</p>
      </div>

      {competitorComparison ? (
        <div className="space-y-4">
          <div className="rounded-md border border-line bg-white p-4">
            <p className="text-sm text-muted">{competitorComparison.summary}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <TextList label="Customer advantages" items={competitorComparison.customerAdvantages} />
              <TextList label="Competitor advantages" items={competitorComparison.competitorAdvantages} />
            </div>
          </div>

          <div className="space-y-3">
            {competitorComparison.gaps.length > 0 ? (
              competitorComparison.gaps.map((gap) => (
                <article key={`${gap.area}-${gap.recommendation}`} className="rounded-md border border-line bg-white p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold text-ink">{gap.area}</h3>
                      <p className="mt-2 text-sm text-muted">{gap.recommendation}</p>
                    </div>
                    <span className={`w-fit rounded-full border px-2 py-1 text-xs font-medium ${comparisonImpactClass(gap.impact)}`}>
                      {gap.impact}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-line bg-panel px-3 py-2">
                      <p className="text-xs font-semibold uppercase text-muted">Customer state</p>
                      <p className="mt-2 text-sm text-ink">{gap.customerCurrentState}</p>
                    </div>
                    <div className="rounded-md border border-line bg-panel px-3 py-2">
                      <p className="text-xs font-semibold uppercase text-muted">Competitor observation</p>
                      <p className="mt-2 text-sm text-ink">{gap.competitorObservation}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <TextList label="Evidence" items={gap.evidence} />
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-md border border-line bg-white px-4 py-6 text-center text-sm text-muted">
                No evidence-backed competitor gaps were generated.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-line bg-white px-4 py-6 text-center text-sm text-muted">
          {hasCompetitors ? "No competitor comparison has been generated yet." : "No manual competitors were added for comparison."}
        </div>
      )}
    </section>
  );
}

function OpportunitySection({ opportunities }: { opportunities: Opportunity[] }) {
  const quickWins = opportunities.filter(isQuickWinOpportunity);
  const strategicProjects = opportunities.filter(isStrategicProjectOpportunity);
  const otherOpportunities = opportunities.filter(
    (opportunity) => !isQuickWinOpportunity(opportunity) && !isStrategicProjectOpportunity(opportunity)
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Opportunities</h2>
          <p className="mt-1 text-sm text-muted">Implementation-ready tasks generated from audit evidence.</p>
        </div>
        <span className="rounded-full border border-line bg-white px-2 py-1 text-xs font-medium text-muted">
          {opportunities.length}
        </span>
      </div>

      {opportunities.length === 0 ? (
        <div className="rounded-md border border-line bg-white px-4 py-6 text-center text-sm text-muted">
          No opportunities have been generated yet.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Quick wins" value={quickWins.length} />
            <MiniMetric label="Strategic projects" value={strategicProjects.length} />
            <MiniMetric label="Other tasks" value={otherOpportunities.length} />
          </div>

          {quickWins.length > 0 ? <OpportunityGroup title="Quick wins" opportunities={quickWins} /> : null}
          {strategicProjects.length > 0 ? (
            <OpportunityGroup title="Strategic projects" opportunities={strategicProjects} />
          ) : null}
          {otherOpportunities.length > 0 ? <OpportunityGroup title="Other opportunities" opportunities={otherOpportunities} /> : null}
        </div>
      )}
    </section>
  );
}

function OpportunityGroup({ title, opportunities }: { title: string; opportunities: Opportunity[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold uppercase text-muted">{title}</h3>
        <span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs font-medium text-muted">
          {opportunities.length}
        </span>
      </div>
      <div className="space-y-3">
        {opportunities.map((opportunity) => (
          <OpportunityCard key={opportunity.id} opportunity={opportunity} />
        ))}
      </div>
    </div>
  );
}

function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const evidence = getStringArrayFromJson(opportunity.evidence);
  const affectedPages = getStringArrayFromJson(opportunity.affectedPages);
  const acceptanceCriteria = getStringArrayFromJson(opportunity.acceptanceCriteria);
  const competitorExamples = getStringArrayFromJson(opportunity.relatedCompetitorExamples);

  return (
    <article className="rounded-md border border-line bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold text-ink">{opportunity.title}</h3>
          <p className="mt-2 text-sm text-muted">{opportunity.description}</p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          {isQuickWinOpportunity(opportunity) ? <Badge label="Quick win" className="border-emerald-200 bg-emerald-50 text-emerald-900" /> : null}
          {isStrategicProjectOpportunity(opportunity) ? (
            <Badge label="Strategic" className="border-violet-200 bg-violet-50 text-violet-900" />
          ) : null}
          <Badge label={opportunity.priority} className={priorityClass(opportunity.priority)} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <MiniMetric label="Category" value={formatToken(opportunity.category)} />
        <MiniMetric label="Effort" value={formatToken(opportunity.estimatedEffort)} />
        <MiniMetric label="Impact" value={formatToken(opportunity.expectedImpact)} />
        <MiniMetric label="Complexity" value={formatToken(opportunity.implementationComplexity)} />
        <MiniMetric label="Pages" value={affectedPages.length} />
      </div>

      {opportunity.suggestedImplementation ? (
        <div className="mt-4 rounded-md border border-line bg-panel px-3 py-2">
          <p className="text-xs font-semibold uppercase text-muted">Suggested implementation</p>
          <p className="mt-2 text-sm text-ink">{opportunity.suggestedImplementation}</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TextList label="Evidence" items={evidence} />
        <TextList label="Acceptance criteria" items={acceptanceCriteria} />
        <TextList label="Affected pages" items={affectedPages} />
        <TextList label="Competitor examples" items={competitorExamples} />
      </div>
    </article>
  );
}

function ScorecardSection({ scorecard }: { scorecard: AuditScorecard | null }) {
  return (
    <section className="space-y-3">
      <div className="border-b border-line pb-3">
        <h2 className="text-base font-semibold text-ink">Scorecard</h2>
        <p className="mt-1 text-sm text-muted">Deterministic scoring from crawled, detector, technical, and competitor signals.</p>
      </div>

      {scorecard ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <ScoreBadge label="Overall" value={scorecard.overall} />
          <ScoreBadge label="UX" value={scorecard.ux} />
          <ScoreBadge label="Conversion" value={scorecard.conversion} />
          <ScoreBadge label="Performance" value={scorecard.performance} />
          <ScoreBadge label="SEO" value={scorecard.seo} />
          <ScoreBadge label="Accessibility" value={scorecard.accessibility} />
          <ScoreBadge label="Competitors" value={scorecard.competitorPositioning} />
        </div>
      ) : (
        <div className="rounded-md border border-line bg-white px-4 py-6 text-center text-sm text-muted">
          No scorecard has been generated yet.
        </div>
      )}
    </section>
  );
}

function SiteProfileSection({ siteProfile }: { siteProfile: SiteProfile | null }) {
  return (
    <section className="space-y-3">
      <div className="border-b border-line pb-3">
        <h2 className="text-base font-semibold text-ink">Site profile</h2>
        <p className="mt-1 text-sm text-muted">Structured AI profile generated from homepage evidence.</p>
      </div>

      {siteProfile ? (
        <div className="rounded-md border border-line bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Industry" value={siteProfile.likelyIndustry} />
            <MiniMetric label="Type" value={siteProfile.ecommerceType} />
            <MiniMetric label="Confidence" value={`${Math.round(siteProfile.confidence * 100)}%`} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Detail label="Brand" value={siteProfile.brandName ?? "-"} />
            <Detail label="Audience" value={siteProfile.targetAudience} />
            <Detail label="Positioning" value={siteProfile.pricePositioning} />
            <Detail label="Business model" value={siteProfile.businessModel} />
          </div>
          {siteProfile.mainProductCategories.length > 0 ? (
            <p className="mt-4 text-sm text-muted">Categories: {siteProfile.mainProductCategories.join(", ")}</p>
          ) : null}
          {siteProfile.reasoning.length > 0 ? (
            <p className="mt-2 text-sm text-muted">Reasoning: {siteProfile.reasoning.slice(0, 3).join(" | ")}</p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-md border border-line bg-white px-4 py-6 text-center text-sm text-muted">
          No site profile has been generated yet.
        </div>
      )}
    </section>
  );
}

function PageUXAnalysisPanel({ aiAnalysis }: { aiAnalysis: PageUXAnalysis | null }) {
  if (!aiAnalysis) {
    return (
      <div className="mt-4 rounded-md border border-line bg-panel px-3 py-2 text-sm text-muted">
        No page UX AI analysis yet.
      </div>
    );
  }

  return (
    <details className="mt-4 rounded-md border border-line bg-panel">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink">
        Page UX AI analysis: priority {Math.round(aiAnalysis.priorityScore)}
      </summary>
      <div className="space-y-3 border-t border-line bg-white px-3 py-3">
        <p className="text-sm text-muted">{aiAnalysis.summary}</p>
        <div className="grid gap-3 md:grid-cols-3">
          <TextList label="Strengths" items={aiAnalysis.strengths} />
          <TextList label="Weaknesses" items={aiAnalysis.weaknesses} />
          <TextList label="Missed opportunities" items={aiAnalysis.missedOpportunities} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <TextList label="Conversion findings" items={aiAnalysis.ecommerceFindings.conversion} />
          <TextList label="Technical findings" items={aiAnalysis.technicalFindings.frontendQuality} />
        </div>
      </div>
    </details>
  );
}

function TextList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm text-ink">
          {items.slice(0, 5).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">-</p>
      )}
    </div>
  );
}

function formatStatus(status: AuditStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`w-fit rounded-full border px-2 py-1 text-xs font-medium ${className}`}>{formatToken(label)}</span>;
}

function IssueSummary({ label, value }: { label: string; value: number }) {
  const hasIssues = value > 0;

  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${
        hasIssues ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      <span className="font-medium">{label}</span>: {value}
    </div>
  );
}

function TechnicalAuditPanel({
  lighthouse,
  accessibility
}: {
  lighthouse: LighthouseSummary | TechnicalAuditError | null;
  accessibility: AccessibilitySummary | TechnicalAuditError | null;
}) {
  if (!lighthouse && !accessibility) {
    return (
      <div className="mt-4 rounded-md border border-line bg-panel px-3 py-2 text-sm text-muted">
        No Lighthouse or accessibility audit results yet.
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="rounded-md border border-line bg-white p-3">
        <h4 className="text-sm font-semibold text-ink">Lighthouse mobile</h4>
        {lighthouse ? <LighthouseBlock lighthouse={lighthouse} /> : <p className="mt-2 text-sm text-muted">No result yet.</p>}
      </div>
      <div className="rounded-md border border-line bg-white p-3">
        <h4 className="text-sm font-semibold text-ink">Accessibility</h4>
        {accessibility ? <AccessibilityBlock accessibility={accessibility} /> : <p className="mt-2 text-sm text-muted">No result yet.</p>}
      </div>
    </div>
  );
}

function LighthouseBlock({ lighthouse }: { lighthouse: LighthouseSummary | TechnicalAuditError }) {
  if (isTechnicalAuditError(lighthouse)) {
    return <ErrorBox message={lighthouse.error.message} />;
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <ScoreBadge label="Performance" value={lighthouse.performance} />
        <ScoreBadge label="Accessibility" value={lighthouse.accessibility} />
        <ScoreBadge label="Best practices" value={lighthouse.bestPractices} />
        <ScoreBadge label="SEO" value={lighthouse.seo} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted">
        <MetricLine label="FCP" value={formatMetricMs(lighthouse.metrics.firstContentfulPaint)} />
        <MetricLine label="LCP" value={formatMetricMs(lighthouse.metrics.largestContentfulPaint)} />
        <MetricLine label="TBT" value={formatMetricMs(lighthouse.metrics.totalBlockingTime)} />
        <MetricLine label="CLS" value={formatMetricNumber(lighthouse.metrics.cumulativeLayoutShift)} />
      </div>

      {lighthouse.opportunities.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase text-muted">Top opportunities</p>
          <div className="mt-2 space-y-2">
            {lighthouse.opportunities.slice(0, 3).map((opportunity) => (
              <div key={opportunity.id} className="rounded-md border border-line bg-panel px-2 py-2">
                <p className="text-xs font-medium text-ink">{opportunity.title}</p>
                {opportunity.displayValue ? <p className="mt-1 text-xs text-muted">{opportunity.displayValue}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccessibilityBlock({ accessibility }: { accessibility: AccessibilitySummary | TechnicalAuditError }) {
  if (isTechnicalAuditError(accessibility)) {
    return <ErrorBox message={accessibility.error.message} />;
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-5 gap-2">
        <CountBadge label="All" value={accessibility.violationCount} />
        <CountBadge label="Critical" value={accessibility.criticalCount} />
        <CountBadge label="Serious" value={accessibility.seriousCount} />
        <CountBadge label="Moderate" value={accessibility.moderateCount} />
        <CountBadge label="Minor" value={accessibility.minorCount} />
      </div>

      {accessibility.violations.length > 0 ? (
        <div className="space-y-2">
          {accessibility.violations.slice(0, 4).map((violation) => (
            <div key={violation.id} className="rounded-md border border-line bg-panel px-2 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-ink">{violation.help || violation.id}</p>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${impactClass(violation.impact)}`}>
                  {violation.impact ?? "n/a"}
                </span>
              </div>
              {violation.nodes[0]?.target.length ? (
                <p className="mt-1 break-all text-xs text-muted">{violation.nodes[0].target.join(", ")}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-emerald-800">No axe violations found.</p>
      )}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{message}</div>;
}

function ScoreBadge({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={`rounded-md border px-2 py-2 ${scoreClass(value)}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value ?? "-"}</p>
    </div>
  );
}

function CountBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-panel px-2 py-2 text-center">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
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

function DetectorResultsPanel({ detectorResults }: { detectorResults: DetectorResult[] }) {
  if (detectorResults.length === 0) {
    return (
      <div className="mt-4 rounded-md border border-line bg-panel px-3 py-2 text-sm text-muted">
        No detector results yet.
      </div>
    );
  }

  const failedResults = detectorResults.filter((detector) => !detector.passed);
  const passedCount = detectorResults.length - failedResults.length;
  const sortedResults = [...failedResults, ...detectorResults.filter((detector) => detector.passed)];

  return (
    <details className="mt-4 rounded-md border border-line bg-panel" open>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink">
        Detectors: {passedCount} passed, {failedResults.length} attention
      </summary>
      <div className="divide-y divide-line border-t border-line bg-white">
        {sortedResults.map((detector) => (
          <div key={detector.key} className="grid gap-2 px-3 py-3 md:grid-cols-[1fr_110px_90px] md:items-start">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`size-2 rounded-full ${detector.passed ? "bg-emerald-500" : "bg-amber-500"}`}
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-ink">{detector.label}</p>
              </div>
              {detector.evidence.length > 0 ? (
                <p className="mt-1 text-xs text-muted">{detector.evidence.slice(0, 2).join(" | ")}</p>
              ) : null}
            </div>
            <span className={`w-fit rounded-full border px-2 py-1 text-xs font-medium ${severityClass(detector.severity)}`}>
              {detector.severity}
            </span>
            <span className="text-xs text-muted">Confidence {Math.round(detector.confidence * 100)}%</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function ScreenshotPreview({ label, storagePath }: { label: string; storagePath: string | null }) {
  const screenshotUrl = getStorageUrl(storagePath);

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">{label}</p>
      {screenshotUrl ? (
        <a href={screenshotUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-line bg-panel">
          <img src={screenshotUrl} alt={`${label} screenshot`} className="h-72 w-full object-cover object-top" />
        </a>
      ) : (
        <div className="flex h-72 items-center justify-center rounded-md border border-line bg-panel text-sm text-muted">
          No screenshot
        </div>
      )}
    </div>
  );
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

function getDetectorResults(value: unknown): DetectorResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isDetectorResult);
}

function getScorecard(value: unknown): AuditScorecard | null {
  if (!value || typeof value !== "object") {
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
  if (!value || typeof value !== "object") {
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
  if (!value || typeof value !== "object") {
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

function isDetectorResult(value: unknown): value is DetectorResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.key === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.passed === "boolean" &&
    typeof candidate.confidence === "number" &&
    typeof candidate.severity === "string" &&
    Array.isArray(candidate.evidence)
  );
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

function isTechnicalAuditError(value: unknown): value is TechnicalAuditError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const error = candidate.error as Record<string, unknown> | undefined;

  return Boolean(error && typeof error.message === "string" && typeof error.source === "string");
}

function isLighthouseSummary(value: unknown): value is LighthouseSummary {
  if (!value || typeof value !== "object") {
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
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return typeof candidate.violationCount === "number" && Array.isArray(candidate.violations);
}

function formatMetricMs(value?: number) {
  if (typeof value !== "number") {
    return "-";
  }

  return `${Math.round(value)}ms`;
}

function formatMetricNumber(value?: number) {
  if (typeof value !== "number") {
    return "-";
  }

  return value.toFixed(3);
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

function formatToken(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function impactClass(impact: AccessibilitySummary["violations"][number]["impact"]) {
  if (impact === "critical" || impact === "serious") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (impact === "moderate") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (impact === "minor") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
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
