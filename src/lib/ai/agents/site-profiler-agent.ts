import type { AuditPage, AuditProject } from "@prisma/client";
import type { AIProvider } from "../provider";
import { siteProfilerSystemPrompt } from "../prompts";
import type { SiteProfile } from "../schemas";
import { stringifyForAIPrompt } from "../input-limits";

export async function runSiteProfilerAgent(params: {
  provider: AIProvider;
  project: Pick<AuditProject, "url" | "normalizedUrl" | "brandName" | "industry" | "country">;
  homepage: Pick<
    AuditPage,
    "title" | "metaDescription" | "domText" | "headings" | "links" | "detectorResults" | "screenshotPath" | "mobileScreenshotPath"
  >;
}) {
  return params.provider.generateJSON<SiteProfile>({
    system: siteProfilerSystemPrompt,
    prompt: buildSiteProfilerPrompt(params),
    schemaName: "SiteProfile",
    maxRetries: 2
  });
}

function buildSiteProfilerPrompt(params: {
  project: Pick<AuditProject, "url" | "normalizedUrl" | "brandName" | "industry" | "country">;
  homepage: Pick<
    AuditPage,
    "title" | "metaDescription" | "domText" | "headings" | "links" | "detectorResults" | "screenshotPath" | "mobileScreenshotPath"
  >;
}) {
  const payload = {
    url: params.project.normalizedUrl,
    brandNameInput: params.project.brandName,
    industryInput: params.project.industry,
    countryInput: params.project.country,
    homepage: {
      title: params.homepage.title,
      metaDescription: params.homepage.metaDescription,
      visibleText: truncate(params.homepage.domText, 6_000),
      headings: params.homepage.headings,
      navLinks: firstItems(params.homepage.links, 40),
      detectedCategories: inferCategories(params.homepage.links),
      detectorResults: params.homepage.detectorResults,
      screenshotSummary: {
        desktopScreenshotAvailable: Boolean(params.homepage.screenshotPath),
        mobileScreenshotAvailable: Boolean(params.homepage.mobileScreenshotPath)
      }
    }
  };

  return [
    "Bu e-ticaret auditi için SiteProfile JSON objesi oluştur.",
    "Sadece bu kanıtları kullan. Kanıt zayıfsa confidence düşük kalsın.",
    "JSON key ve enum değerlerini schema ile aynı tut; tüm açıklama/string değerlerini Türkçe yaz.",
    "INPUT_JSON:",
    stringifyForAIPrompt(payload)
  ].join("\n");
}

function inferCategories(links: unknown) {
  if (!Array.isArray(links)) {
    return [];
  }

  return links
    .map((link) => {
      if (!link || typeof link !== "object") {
        return null;
      }

      const candidate = link as Record<string, unknown>;
      const text = typeof candidate.text === "string" ? candidate.text : "";
      const href = typeof candidate.href === "string" ? candidate.href : "";

      if (!/(category|kategori|collection|koleksiyon|shop|products|urun|ürün)/i.test(`${text} ${href}`)) {
        return null;
      }

      return text || href;
    })
    .filter((value): value is string => Boolean(value))
    .slice(0, 20);
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
