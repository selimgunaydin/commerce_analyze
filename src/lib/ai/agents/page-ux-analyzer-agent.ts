import type { AuditPage } from "@prisma/client";
import type { AIProvider } from "../provider";
import { pageUXAnalyzerSystemPrompt } from "../prompts";
import type { PageUXAnalysis } from "../schemas";
import { stringifyForAIPrompt } from "../input-limits";

export async function runPageUXAnalyzerAgent(params: {
  provider: AIProvider;
  page: Pick<
    AuditPage,
    | "pageType"
    | "title"
    | "metaDescription"
    | "domText"
    | "headings"
    | "links"
    | "buttons"
    | "forms"
    | "detectorResults"
    | "lighthouse"
    | "accessibility"
    | "screenshotPath"
    | "mobileScreenshotPath"
  >;
}) {
  return params.provider.generateJSON<PageUXAnalysis>({
    system: pageUXAnalyzerSystemPrompt,
    prompt: buildPageUXAnalyzerPrompt(params.page),
    schemaName: "PageUXAnalysis",
    maxRetries: 2
  });
}

function buildPageUXAnalyzerPrompt(
  page: Pick<
    AuditPage,
    | "pageType"
    | "title"
    | "metaDescription"
    | "domText"
    | "headings"
    | "links"
    | "buttons"
    | "forms"
    | "detectorResults"
    | "lighthouse"
    | "accessibility"
    | "screenshotPath"
    | "mobileScreenshotPath"
  >
) {
  const payload = {
    pageType: page.pageType,
    title: page.title,
    metaDescription: page.metaDescription,
    visibleText: truncate(page.domText, 6_000),
    headings: page.headings,
    links: firstItems(page.links, 80),
    buttons: firstItems(page.buttons, 80),
    forms: firstItems(page.forms, 30),
    detectorResults: page.detectorResults,
    lighthouse: page.lighthouse,
    accessibility: page.accessibility,
    screenshotSummary: {
      desktopScreenshotAvailable: Boolean(page.screenshotPath),
      mobileScreenshotAvailable: Boolean(page.mobileScreenshotPath)
    }
  };

  return [
    "Bu e-ticaret audit sayfası için PageUXAnalysis JSON objesi oluştur.",
    "Sadece bu kanıtları kullan. Veride dayanağı olmayan gözlem uydurma.",
    "Zayıf alanları ve kaçırılmış fırsatları müşteri yolculuğu dilinde yaz: keşif, değerlendirme, satın alma, teslimat/iade güveni ve tekrar satın alma.",
    "PDP için sticky sepete ekle, ürün varyantı, beden rehberi, teslimat/iade, yorum/puan ve benzer ürün sinyallerini müşteri davranışı açısından yorumla.",
    "PLP için filtre, sıralama, hızlı sepet, favori ve ürün keşfi kolaylığını değerlendir.",
    "Ana sayfa için sadakat/puan/kulüp, arama, kategori kısayolu, kampanya, güven ve destek sinyallerini değerlendir.",
    "JSON key ve enum değerlerini schema ile aynı tut; tüm açıklama/string değerlerini Türkçe yaz.",
    "INPUT_JSON:",
    stringifyForAIPrompt(payload)
  ].join("\n");
}

function firstItems(value: unknown, count: number) {
  return Array.isArray(value) ? value.slice(0, count) : [];
}

function truncate(value: string | null, maxLength: number) {
  if (!value) {
    return "";
  }

  return value.slice(0, maxLength);
}
