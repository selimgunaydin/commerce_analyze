import { AuditStatus, type AuditPage } from "@prisma/client";
import { ArrowLeft, RefreshCw } from "lucide-react";
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
      }
    }
  });

  if (!audit) {
    notFound();
  }

  const activeIndex = statusOrder.indexOf(audit.status);
  const pagesByType = groupPagesByType(audit.pages);
  const scorecard = getScorecard(audit.reports[0]?.scorecard);

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

      <ScorecardSection scorecard={scorecard} />

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

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
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
