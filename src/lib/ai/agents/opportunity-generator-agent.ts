import type { AuditPage, AuditProject, AuditReport } from "@prisma/client";
import type { AIProvider } from "../provider";
import { opportunityGeneratorSystemPrompt } from "../prompts";
import type { OpportunityGeneration } from "../schemas";
import { stringifyForAIPrompt } from "../input-limits";

export async function runOpportunityGeneratorAgent(params: {
  provider: AIProvider;
  project: Pick<AuditProject, "normalizedUrl" | "brandName" | "industry" | "country" | "siteProfile">;
  pages: AuditPage[];
  report: Pick<AuditReport, "scorecard" | "content"> | null;
}) {
  return params.provider.generateJSON<OpportunityGeneration>({
    system: opportunityGeneratorSystemPrompt,
    prompt: buildOpportunityGeneratorPrompt(params),
    schemaName: "OpportunityGeneration",
    maxRetries: 2
  });
}

function buildOpportunityGeneratorPrompt(params: {
  project: Pick<AuditProject, "normalizedUrl" | "brandName" | "industry" | "country" | "siteProfile">;
  pages: AuditPage[];
  report: Pick<AuditReport, "scorecard" | "content"> | null;
}) {
  const reportContent = asRecord(params.report?.content);
  const payload = {
    customerSite: {
      url: params.project.normalizedUrl,
      brandName: params.project.brandName,
      industry: params.project.industry,
      country: params.project.country,
      siteProfile: params.project.siteProfile
    },
    scorecard: params.report?.scorecard ?? null,
    competitorComparison: reportContent?.competitorComparison ?? null,
    customerPages: params.pages.map(compactPage)
  };

  return [
    "Create an OpportunityGeneration JSON object.",
    "Return 5-15 implementation-ready opportunities using only the provided evidence.",
    "Every opportunity must include concrete evidence, affected pages, effort, impact, complexity, acceptance criteria, and suggested implementation.",
    "Use competitorComparison.gaps when present, but do not invent competitor examples.",
    "INPUT_JSON:",
    stringifyForAIPrompt(payload)
  ].join("\n");
}

function compactPage(page: AuditPage) {
  return {
    url: page.url,
    pageType: page.pageType,
    title: page.title,
    metaDescription: page.metaDescription,
    detectorResults: page.detectorResults,
    lighthouse: page.lighthouse,
    accessibility: page.accessibility,
    aiAnalysis: page.aiAnalysis,
    consoleErrors: page.consoleErrors,
    failedRequests: page.failedRequests
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}
