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
    "FinalAuditReport JSON objesi oluştur.",
    "executiveSummary, topFindings ve competitorSummary anlatımını iyileştirebilirsin; fırsat ekleme veya çıkarma.",
    "Tüm opportunity kanıtlarını, affectedPages alanlarını, efor/etki/karmaşıklık değerlerini ve kabul kriterlerini koru.",
    "JSON key ve enum değerlerini schema ile aynı tut; tüm açıklama/string değerlerini Türkçe yaz.",
    "INPUT_JSON:",
    stringifyForAIPrompt(payload)
  ].join("\n");
}
