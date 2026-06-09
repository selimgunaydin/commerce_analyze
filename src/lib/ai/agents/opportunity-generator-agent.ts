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
    "OpportunityGeneration JSON objesi oluştur.",
    "Sadece verilen kanıtları kullanarak 5-15 arası uygulamaya hazır fırsat döndür.",
    "Her fırsatta somut kanıt, etkilenen sayfalar, efor, etki, karmaşıklık, kabul kriterleri ve önerilen uygulama olsun.",
    "Her fırsatta customerJourneyStage, customerProblem, customerBenefit ve businessRationale alanlarını Türkçe ve müşteri bakışıyla doldur.",
    "customerProblem alanı teknik hata değil, müşterinin alışveriş yolculuğunda yaşadığı sürtünme olmalı.",
    "customerBenefit alanı müşterinin işi nasıl daha kolay, güvenli veya cazip yaşayacağını anlatmalı.",
    "businessRationale alanı dönüşüm, güven, sepet oranı, tekrar satın alma veya destek yükü açısından gerekçeyi yazmalı.",
    "Sadakat/puan/kulüp, favori, hızlı sepet, sticky sepete ekle, yorum/puan, kargo/iade ve canlı destek sinyallerini müşteri etkisiyle değerlendir.",
    "competitorComparison.gaps varsa kullan; olmayan rakip örneği uydurma.",
    "JSON key ve enum değerlerini schema ile aynı tut; tüm açıklama/string değerlerini Türkçe yaz.",
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
