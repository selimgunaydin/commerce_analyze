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
  const comparison = await params.provider.generateJSON<CompetitorComparison>({
    system: competitorComparisonSystemPrompt,
    prompt: buildCompetitorComparisonPrompt(params),
    schemaName: "CompetitorComparison",
    maxRetries: 2
  });

  return normalizeCompetitorComparison(comparison, params.customerHomepage, params.competitors);
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
    "CompetitorComparison JSON objesi oluştur.",
    "Sadece müşteri ana sayfasını manuel sağlanan rakip ana sayfa kanıtlarıyla karşılaştır.",
    "JSON key ve enum değerlerini schema ile aynı tut; tüm açıklama/string değerlerini Türkçe yaz.",
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

function normalizeCompetitorComparison(
  comparison: CompetitorComparison,
  customerHomepage: AuditPage,
  competitors: CompetitorWithPages[]
): CompetitorComparison {
  const customerDetectors = getDetectorResults(customerHomepage.detectorResults);
  const competitorDetectors = competitors.flatMap((competitor) => competitor.pages.flatMap((page) => getDetectorResults(page.detectorResults)));

  return {
    ...comparison,
    gaps: comparison.gaps.filter((gap) => {
      const key = detectorKeyForArea(gap.area);
      const customerPassed = key ? customerDetectors.some((detector) => detector.key === key && detector.passed) : false;
      const competitorPassed = key ? competitorDetectors.some((detector) => detector.key === key && detector.passed) : true;

      if (customerPassed || !competitorPassed) {
        return false;
      }

      return !looksLikeCustomerAdvantage(gap.customerCurrentState) && !looksLikeCompetitorMissing(gap.competitorObservation);
    })
  };
}

function getDetectorResults(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is { key: string; passed: boolean } => {
      return (
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).key === "string" &&
        typeof (item as Record<string, unknown>).passed === "boolean"
      );
    });
}

function detectorKeyForArea(area: string) {
  const normalized = normalize(area);

  if (/(footer|support links|destek link)/.test(normalized)) return "homepage_has_footer_links";
  if (/(hero|vitrin)/.test(normalized)) return "homepage_has_hero";
  if (/(primary cta|cta|aksiyon)/.test(normalized)) return "homepage_has_cta";
  if (/(delivery|return|kargo|iade|teslimat)/.test(normalized)) return "homepage_has_delivery_return_value";
  if (/(trust|badge|guven|güven)/.test(normalized)) return "homepage_has_trust_badge";
  if (/(social proof|review|rating|yorum|puan)/.test(normalized)) return "homepage_has_social_proof";
  if (/(category|kategori)/.test(normalized)) return "homepage_has_category_shortcuts";
  if (/(search|arama)/.test(normalized)) return "homepage_has_search_input";
  if (/(mobile menu|mobil menu|hamburger)/.test(normalized)) return "homepage_has_mobile_menu_signal";
  if (/(h1|heading|baslik|başlık)/.test(normalized)) return "homepage_has_h1";

  return null;
}

function looksLikeCustomerAdvantage(value: string) {
  const normalized = normalize(value);

  return /(mevcut|var|vardir|bulunmaktadir|gorunmektedir|görünmektedir|korunmali|korunmalı|avantaj|kapsamli|kapsamlı)/.test(normalized);
}

function looksLikeCompetitorMissing(value: string) {
  const normalized = normalize(value);

  return /(yok|bulunmamaktadir|gorunmemektedir|görünmemektedir|mevcut degil|mevcut değil|az sayida|az sayıda)/.test(normalized);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
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
