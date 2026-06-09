import type { AuditPage } from "@prisma/client";
import type { CompetitorComparison, FinalAuditReport } from "@/src/lib/ai/schemas";
import { MarkdownActions } from "./markdown-actions";
import {
  CompetitorSection,
  CustomerLensSection,
  ExecutiveSummarySection,
  OpportunityListSection,
  PageFindingsSection,
  ReportHero,
  RoadmapSection,
  ScorecardSection,
  ScreenshotGallery,
  SiteProfileSection,
  TechnicalAppendixSection,
  TechnicalAuditSection
} from "./report-sections";
import { dedupeOpportunities, getPagesByType } from "./report-utils";

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
  const { homePages, pdpPages, plpPages } = getPagesByType(pages);
  const opportunities = dedupeOpportunities(finalReport.opportunities);
  const quickWins = dedupeOpportunities(finalReport.quickWins);
  const strategicProjects = dedupeOpportunities(finalReport.strategicProjects);
  const screenshots = finalReport.technicalAppendix.screenshots;

  return (
    <div className="space-y-8">
      <ReportHero finalReport={finalReport} actions={<MarkdownActions markdown={markdown} />} />
      <ExecutiveSummarySection finalReport={finalReport} />
      <SiteProfileSection finalReport={finalReport} />
      <ScorecardSection finalReport={finalReport} />
      <CompetitorSection competitorComparison={competitorComparison} />
      <CustomerLensSection opportunities={opportunities} />
      <RoadmapSection quickWins={quickWins} strategicProjects={strategicProjects} />
      <PageFindingsSection title="Ana Sayfa Bulguları" pages={homePages} />
      <PageFindingsSection title="Listeleme Bulguları" pages={plpPages} />
      <PageFindingsSection title="Ürün Detay Bulguları" pages={pdpPages} />
      <TechnicalAuditSection title="Teknik Audit" kind="performance" pages={pages} />
      <TechnicalAuditSection title="SEO Audit" kind="seo" pages={pages} />
      <TechnicalAuditSection title="Erişilebilirlik Audit" kind="accessibility" pages={pages} />
      <OpportunityListSection opportunities={opportunities} screenshots={screenshots} />
      <ScreenshotGallery screenshots={screenshots} />
      <TechnicalAppendixSection finalReport={finalReport} />
    </div>
  );
}
