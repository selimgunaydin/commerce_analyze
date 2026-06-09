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

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-line bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-muted">AI Commerce Audit Report</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Overall score {Math.round(finalReport.scorecard.overall)}</h1>
            <p className="mt-3 max-w-4xl text-sm text-muted">{finalReport.executiveSummary}</p>
          </div>
          <MarkdownActions markdown={markdown} />
        </div>
      </section>

      <ReportSection title="Executive Summary">
        <p className="text-sm text-muted">{finalReport.executiveSummary}</p>
      </ReportSection>

      <ReportSection title="Site Profile">
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Industry" value={finalReport.siteProfile.likelyIndustry} />
          <Metric label="Type" value={formatToken(finalReport.siteProfile.ecommerceType)} />
          <Metric label="Confidence" value={`${Math.round(finalReport.siteProfile.confidence * 100)}%`} />
        </div>
        <p className="mt-3 text-sm text-muted">
          Audience: {finalReport.siteProfile.targetAudience}. Positioning: {formatToken(finalReport.siteProfile.pricePositioning)}.
        </p>
      </ReportSection>

      <ReportSection title="Scorecard">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <Score label="Overall" value={finalReport.scorecard.overall} />
          <Score label="UX" value={finalReport.scorecard.ux} />
          <Score label="Conversion" value={finalReport.scorecard.conversion} />
          <Score label="Performance" value={finalReport.scorecard.performance} />
          <Score label="SEO" value={finalReport.scorecard.seo} />
          <Score label="Accessibility" value={finalReport.scorecard.accessibility} />
          <Score label="Competitors" value={finalReport.scorecard.competitorPositioning} />
        </div>
      </ReportSection>

      <ReportSection title="Top Findings">
        <TextList items={finalReport.topFindings} />
      </ReportSection>

      <ReportSection title="Competitor Summary">
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

      <PageFindingSection title="Homepage Findings" pages={homePages} />
      <PageFindingSection title="PLP Findings" pages={plpPages} />
      <PageFindingSection title="PDP Findings" pages={pdpPages} />

      <ReportSection title="Technical Audit">
        <TechnicalSummary pages={pages} kind="performance" />
      </ReportSection>

      <ReportSection title="SEO Audit">
        <TechnicalSummary pages={pages} kind="seo" />
      </ReportSection>

      <ReportSection title="Accessibility Audit">
        <TechnicalSummary pages={pages} kind="accessibility" />
      </ReportSection>

      <ReportSection title="Conversion Opportunities">
        <OpportunityList opportunities={finalReport.opportunities.filter((opportunity) => opportunity.category === "conversion")} />
      </ReportSection>

      <ReportSection title="Quick Wins">
        <OpportunityList opportunities={finalReport.quickWins} />
      </ReportSection>

      <ReportSection title="Strategic Projects">
        <OpportunityList opportunities={finalReport.strategicProjects} />
      </ReportSection>

      <ReportSection title="Full Task List">
        <OpportunityList opportunities={finalReport.opportunities} />
      </ReportSection>

      <ReportSection title="Evidence Screenshots">
        {finalReport.technicalAppendix.screenshots.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {finalReport.technicalAppendix.screenshots.slice(0, 8).map((screenshot) => (
              <a key={screenshot} href={storageUrl(screenshot)} target="_blank" rel="noreferrer" className="block">
                <img src={storageUrl(screenshot)} alt="Audit screenshot evidence" className="h-80 w-full rounded-md border border-line object-cover object-top" />
              </a>
            ))}
          </div>
        ) : (
          <Empty>No screenshot evidence available.</Empty>
        )}
      </ReportSection>

      <ReportSection title="Technical Appendix">
        <div className="grid gap-3 md:grid-cols-2">
          <TextList label="Crawled pages" items={finalReport.technicalAppendix.crawledPages} />
          <TextList label="Screenshots" items={finalReport.technicalAppendix.screenshots} />
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
        <Empty>No pages of this type were crawled.</Empty>
      )}
    </ReportSection>
  );
}

function TechnicalSummary({ kind, pages }: { kind: "performance" | "seo" | "accessibility"; pages: AuditPage[] }) {
  const items = pages.map((page) => {
    const lighthouse = asRecord(page.lighthouse);
    const accessibility = asRecord(page.accessibility);

    if (kind === "accessibility") {
      return `${page.pageType}: axe violations ${accessibility?.violationCount ?? "n/a"}, Lighthouse accessibility ${lighthouse?.accessibility ?? "n/a"}`;
    }

    return `${page.pageType}: Lighthouse ${kind} ${lighthouse?.[kind] ?? "n/a"}`;
  });

  return <TextList items={items} />;
}

function OpportunityList({ opportunities }: { opportunities: FinalAuditReport["opportunities"] }) {
  if (opportunities.length === 0) {
    return <Empty>No tasks in this section.</Empty>;
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
            <Metric label="Effort" value={formatToken(opportunity.estimatedEffort)} />
            <Metric label="Impact" value={formatToken(opportunity.expectedImpact)} />
            <Metric label="Complexity" value={formatToken(opportunity.implementationComplexity)} />
            <Metric label="Category" value={formatToken(opportunity.category)} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextList label="Evidence" items={opportunity.evidence} />
            <TextList label="Acceptance criteria" items={opportunity.acceptanceCriteria} />
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
    <div>
      {label ? <p className="text-xs font-semibold uppercase text-muted">{label}</p> : null}
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm text-ink">
          {items.slice(0, 8).map((item) => (
            <li key={item}>{item}</li>
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
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
