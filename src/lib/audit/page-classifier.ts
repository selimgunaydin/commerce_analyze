import { getUrlSegments, getUrlSignalText } from "@/src/lib/utils/url-normalizer";
import type { DiscoveredLink } from "./link-discovery";
import type { ExtractedPageData, PageType } from "./types";

type ScoredPageType = Exclude<PageType, "home">;

export type PageClassification = {
  pageType: PageType;
  confidence: number;
  scores: Record<ScoredPageType, number>;
  reasons: string[];
};

const scoredPageTypes: ScoredPageType[] = ["plp", "pdp", "search", "campaign", "content", "unknown"];

const plpKeywords = [
  "category",
  "categories",
  "kategori",
  "koleksiyon",
  "collection",
  "collections",
  "products",
  "urunler",
  "shop",
  "list"
];

const pdpKeywords = ["product", "products", "urun", "item", "detail", "sku"];
const campaignKeywords = ["campaign", "kampanya", "indirim", "sale", "outlet", "discount", "landing"];
const searchKeywords = ["search", "arama"];

export function classifyLinkCandidate(link: DiscoveredLink): PageClassification {
  const scores = emptyScores();
  const reasons: string[] = [];
  const signalText = normalizeSignalText(`${getUrlSignalText(link.normalizedUrl)} ${link.texts.join(" ")}`);
  const segments = getUrlSegments(link.normalizedUrl).map(normalizeSignalText);
  const url = new URL(link.normalizedUrl);

  addKeywordScore(scores, reasons, "plp", signalText, plpKeywords, 2, "PLP keyword in URL or link text");
  addKeywordScore(scores, reasons, "pdp", signalText, pdpKeywords, 2, "PDP keyword in URL or link text");
  addKeywordScore(scores, reasons, "campaign", signalText, campaignKeywords, 3, "Campaign keyword in URL or link text");
  addKeywordScore(scores, reasons, "search", signalText, searchKeywords, 4, "Search keyword in URL or link text");

  if (segments.includes("c")) {
    addScore(scores, reasons, "plp", 2, "Category shorthand URL segment");
  }

  if (segments.includes("p")) {
    addScore(scores, reasons, "pdp", 2, "Product shorthand URL segment");
  }

  addStructuralUrlSignals(scores, reasons, segments);

  if (url.searchParams.has("q") || url.searchParams.has("query") || url.searchParams.has("search")) {
    addScore(scores, reasons, "search", 4, "Search query parameter");
  }

  return finalizeClassification(scores, reasons);
}

export function classifyExtractedPage(params: {
  extracted: ExtractedPageData;
  link?: DiscoveredLink;
  fallbackPageType?: PageType;
}): PageClassification {
  const linkClassification = params.link ? classifyLinkCandidate(params.link) : null;
  const scores = linkClassification ? { ...linkClassification.scores } : emptyScores();
  const reasons = linkClassification ? [...linkClassification.reasons] : [];
  const text = normalizeSignalText(
    [
      params.extracted.title ?? "",
      params.extracted.metaDescription ?? "",
      params.extracted.visibleText,
      params.extracted.headings.h1.join(" "),
      params.extracted.headings.h2.join(" "),
      params.extracted.buttons.map((button) => `${button.text} ${button.ariaLabel ?? ""}`).join(" "),
      params.extracted.forms
        .flatMap((form) => form.fields.map((field) => `${field.type ?? ""} ${field.placeholder ?? ""} ${field.label ?? ""}`))
        .join(" ")
    ].join(" ")
  );
  const priceCount = countMatches(text, /(?:[$€£₺]\s?\d|\d+(?:[.,]\d{2})?\s?(?:tl|try|usd|eur))/gi);

  if (priceCount >= 4) {
    addScore(scores, reasons, "plp", 3, "Multiple price texts");
  } else if (priceCount > 0) {
    addScore(scores, reasons, "pdp", 1, "Price text");
  }

  if (hasAny(text, ["filter", "filtre", "sort", "sirala", "sırala", "refine"])) {
    addScore(scores, reasons, "plp", 3, "Filter or sort text");
  }

  if (hasAny(text, ["product card", "urun kart", "ürün kart", "grid", "view all products"])) {
    addScore(scores, reasons, "plp", 2, "Product grid or card text");
  }

  if (hasAny(text, ["add to cart", "sepete ekle", "sepet", "buy now", "satın al", "satin al"])) {
    addScore(scores, reasons, "pdp", 4, "Add-to-cart text");
  }

  if (hasAny(text, ["variant", "color", "renk", "size", "beden", "numara", "size guide", "beden tablosu"])) {
    addScore(scores, reasons, "pdp", 2, "Variant or size selector text");
  }

  if (hasAny(text, ["shipping", "delivery", "return", "teslimat", "iade", "stock", "stok"])) {
    addScore(scores, reasons, "pdp", 1, "Shipping, return, or stock text");
  }

  if (params.extracted.headings.h1.length === 1 && priceCount > 0) {
    addScore(scores, reasons, "pdp", 1, "Single H1 with price");
  }

  if (hasSearchInput(params.extracted) || hasAny(text, ["search results", "arama sonuclari", "arama sonuçları"])) {
    addScore(scores, reasons, "search", 4, "Search input or search result text");
  }

  if (hasAny(text, ["campaign", "kampanya", "indirim", "discount", "sale", "outlet", "black friday"])) {
    addScore(scores, reasons, "campaign", 3, "Campaign text");
  }

  if (params.extracted.visibleText.trim().length > 300) {
    addScore(scores, reasons, "content", 1, "Substantial visible text");
  }

  return finalizeClassification(scores, reasons, params.fallbackPageType);
}

function emptyScores(): Record<ScoredPageType, number> {
  return {
    plp: 0,
    pdp: 0,
    search: 0,
    campaign: 0,
    content: 0,
    unknown: 0
  };
}

function addKeywordScore(
  scores: Record<ScoredPageType, number>,
  reasons: string[],
  pageType: ScoredPageType,
  signalText: string,
  keywords: string[],
  score: number,
  reason: string
) {
  if (hasAny(signalText, keywords)) {
    addScore(scores, reasons, pageType, score, reason);
  }
}

function addScore(
  scores: Record<ScoredPageType, number>,
  reasons: string[],
  pageType: ScoredPageType,
  score: number,
  reason: string
) {
  scores[pageType] += score;
  reasons.push(reason);
}

function addStructuralUrlSignals(
  scores: Record<ScoredPageType, number>,
  reasons: string[],
  segments: string[]
) {
  const productIndex = segments.findIndex((segment) => ["product", "products", "urun", "p"].includes(segment));

  if (productIndex >= 0 && productIndex < segments.length - 1) {
    addScore(scores, reasons, "pdp", 2, "Product detail URL shape");
  }

  const productListIndex = segments.findIndex((segment) => ["products", "urunler"].includes(segment));

  if (productListIndex >= 0 && productListIndex === segments.length - 1) {
    addScore(scores, reasons, "plp", 2, "Product listing URL shape");
  }

  const categoryIndex = segments.findIndex((segment) =>
    ["category", "categories", "kategori", "collection", "collections", "koleksiyon", "c"].includes(segment)
  );

  if (categoryIndex >= 0) {
    addScore(scores, reasons, "plp", 2, "Category or collection URL shape");
  }
}

function finalizeClassification(
  scores: Record<ScoredPageType, number>,
  reasons: string[],
  fallbackPageType?: PageType
): PageClassification {
  const sorted = scoredPageTypes
    .filter((pageType) => pageType !== "unknown")
    .map((pageType) => ({
      pageType,
      score: scores[pageType]
    }))
    .sort((left, right) => right.score - left.score);

  const top = sorted[0];
  const fallbackScore = fallbackPageType && fallbackPageType !== "home" ? scores[fallbackPageType as ScoredPageType] : 0;

  if (top && top.score >= 2) {
    return {
      pageType: top.pageType,
      confidence: Math.min(0.95, Math.max(0.35, top.score / 10)),
      scores,
      reasons
    };
  }

  if (fallbackPageType && fallbackPageType !== "home" && fallbackPageType !== "unknown") {
    return {
      pageType: fallbackPageType,
      confidence: Math.min(0.75, Math.max(0.25, fallbackScore / 10)),
      scores,
      reasons
    };
  }

  const pageType: PageType = scores.content > 0 ? "content" : "unknown";

  return {
    pageType,
    confidence: pageType === "content" ? 0.25 : 0,
    scores,
    reasons
  };
}

function normalizeSignalText(value: string) {
  return value
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function hasAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(normalizeSignalText(keyword)));
}

function countMatches(text: string, pattern: RegExp) {
  return Array.from(text.matchAll(pattern)).length;
}

function hasSearchInput(extracted: ExtractedPageData) {
  return extracted.forms.some((form) =>
    form.fields.some((field) =>
      normalizeSignalText(`${field.type ?? ""} ${field.placeholder ?? ""} ${field.label ?? ""}`).includes("search") ||
      normalizeSignalText(`${field.type ?? ""} ${field.placeholder ?? ""} ${field.label ?? ""}`).includes("arama")
    )
  );
}
