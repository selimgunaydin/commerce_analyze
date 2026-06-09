import type { AuditPage, AuditProject, AuditReport, Competitor, CompetitorPage } from "@prisma/client";
import type { AIProvider } from "../provider";
import { competitorComparisonSystemPrompt } from "../prompts";
import type { CompetitorComparison } from "../schemas";
import { stringifyForAIPrompt } from "../input-limits";

type CompetitorWithPages = Competitor & {
  pages: CompetitorPage[];
};

export async function runCompetitorComparisonAgent(params: {
  provider: AIProvider;
  project: Pick<AuditProject, "normalizedUrl" | "brandName" | "siteProfile">;
  customerHomepage: AuditPage;
  report: Pick<AuditReport, "scorecard" | "content"> | null;
  competitors: CompetitorWithPages[];
}) {
  return params.provider.generateJSON<CompetitorComparison>({
    system: competitorComparisonSystemPrompt,
    prompt: buildCompetitorComparisonPrompt(params),
    schemaName: "CompetitorComparison",
    maxRetries: 2
  });
}

function buildCompetitorComparisonPrompt(params: {
  project: Pick<AuditProject, "normalizedUrl" | "brandName" | "siteProfile">;
  customerHomepage: AuditPage;
  report: Pick<AuditReport, "scorecard" | "content"> | null;
  competitors: CompetitorWithPages[];
}) {
  const payload = {
    customerSite: {
      url: params.project.normalizedUrl,
      brandName: params.project.brandName,
      siteProfile: params.project.siteProfile,
      scorecard: params.report?.scorecard ?? null
    },
    customerHomepage: compactCustomerPage(params.customerHomepage),
    competitors: params.competitors.map((competitor) => ({
      name: competitor.name,
      url: competitor.normalizedUrl,
      reason: competitor.reason,
      confidence: competitor.confidence,
      homepage: competitor.pages[0] ? compactCompetitorPage(competitor.pages[0]) : null
    }))
  };

  return [
    "Create a CompetitorComparison JSON object.",
    "Compare only the customer homepage against manually supplied competitor homepage evidence.",
    "INPUT_JSON:",
    stringifyForAIPrompt(payload)
  ].join("\n");
}

function compactCustomerPage(page: AuditPage) {
  return {
    pageType: page.pageType,
    title: page.title,
    metaDescription: page.metaDescription,
    visibleTextSummary: truncate(page.domText, 2_000),
    detectorResults: page.detectorResults,
    lighthouse: page.lighthouse,
    accessibility: page.accessibility,
    aiAnalysis: page.aiAnalysis
  };
}

function compactCompetitorPage(page: CompetitorPage) {
  return {
    pageType: page.pageType,
    title: page.title,
    metaDescription: page.metaDescription,
    visibleTextSummary: truncate(page.domText, 2_000),
    detectorResults: page.detectorResults,
    lighthouse: page.lighthouse,
    accessibility: page.accessibility
  };
}

function truncate(value: string | null, maxLength: number) {
  if (!value) {
    return "";
  }

  return value.slice(0, maxLength);
}
