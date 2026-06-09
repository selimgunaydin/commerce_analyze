import type { AIProvider } from "../provider";
import { reportWriterSystemPrompt } from "../prompts";
import type { FinalAuditReport } from "../schemas";
import { stringifyForAIPrompt } from "../input-limits";

export async function runReportWriterAgent(params: {
  provider: AIProvider;
  finalReportDraft: FinalAuditReport;
}) {
  return params.provider.generateJSON<FinalAuditReport>({
    system: reportWriterSystemPrompt,
    prompt: buildReportWriterPrompt(params.finalReportDraft),
    schemaName: "FinalAuditReport",
    maxRetries: 2
  });
}

function buildReportWriterPrompt(finalReportDraft: FinalAuditReport) {
  const payload = {
    finalReportDraft,
    lockedOpportunityTitles: finalReportDraft.opportunities.map((opportunity) => opportunity.title)
  };

  return [
    "Create a FinalAuditReport JSON object.",
    "You may improve executiveSummary, topFindings, and competitorSummary wording, but do not add or remove opportunities.",
    "Preserve all opportunity evidence, affectedPages, effort, impact, complexity, and acceptance criteria.",
    "INPUT_JSON:",
    stringifyForAIPrompt(payload)
  ].join("\n");
}
