import type { AccessibilitySummary, LighthouseSummary, TechnicalAuditError } from "./technical-audit-normalizer";
import type { DetectorResult } from "./ecommerce-detectors";

export type AuditScorecard = {
  ux: number;
  performance: number;
  seo: number;
  accessibility: number;
  conversion: number;
  competitorPositioning: number;
  overall: number;
};

export type AuditPageScorecard = AuditScorecard & {
  pageType: string;
};

export type ScoringPage = {
  pageType: string;
  domText?: string | null;
  detectorResults?: unknown;
  lighthouse?: unknown;
  accessibility?: unknown;
  consoleErrors?: unknown;
  failedRequests?: unknown;
};

export type ScoringCompetitor = {
  pages: ScoringPage[];
};

const weights = {
  ux: 0.2,
  conversion: 0.25,
  performance: 0.15,
  seo: 0.15,
  accessibility: 0.1,
  competitorPositioning: 0.15
};

const uxDetectorKeys = [
  "homepage_has_hero",
  "homepage_has_cta",
  "homepage_has_header_navigation",
  "homepage_has_search_input",
  "homepage_has_category_shortcuts",
  "plp_has_filter",
  "plp_has_sort",
  "pdp_has_product_title",
  "pdp_has_price",
  "pdp_has_add_to_cart",
  "pdp_has_shipping_return_info"
];

const conversionDetectorKeys = [
  "homepage_has_cta",
  "pdp_has_add_to_cart",
  "pdp_has_sticky_add_to_cart",
  "pdp_has_variant_selector",
  "pdp_has_size_guide",
  "pdp_has_stock_info",
  "pdp_has_shipping_return_info",
  "pdp_has_review_rating",
  "pdp_has_related_products",
  "plp_has_product_grid",
  "plp_has_product_card_signal"
];

const seoDetectorKeys = [
  "technical_has_h1",
  "technical_single_h1",
  "technical_has_meta_description",
  "technical_links_have_text",
  "technical_images_have_alt"
];

const accessibilityDetectorKeys = [
  "technical_buttons_have_accessible_name",
  "technical_form_fields_have_labels",
  "technical_images_have_alt",
  "technical_links_have_text"
];

export function calculateAuditScorecard(params: {
  pages: ScoringPage[];
  competitors: ScoringCompetitor[];
}): AuditScorecard {
  const ux = detectorScore(params.pages, uxDetectorKeys, 68);
  const conversion = detectorScore(params.pages, conversionDetectorKeys, 65);
  const performance = performanceScore(params.pages);
  const seo = seoScore(params.pages);
  const accessibility = accessibilityScore(params.pages);
  const competitorPositioning = competitorPositioningScore(params.pages, params.competitors);
  const overall = weightedOverall({
    ux,
    conversion,
    performance,
    seo,
    accessibility,
    competitorPositioning
  });

  return {
    ux,
    performance,
    seo,
    accessibility,
    conversion,
    competitorPositioning,
    overall
  };
}

export function calculatePageScorecard(page: ScoringPage): AuditPageScorecard {
  const ux = detectorScore([page], uxDetectorKeys, 68);
  const conversion = detectorScore([page], conversionDetectorKeys, 65);
  const performance = performanceScore([page]);
  const seo = seoScore([page]);
  const accessibility = accessibilityScore([page]);
  const competitorPositioning = 50;
  const overall = weightedOverall({
    ux,
    conversion,
    performance,
    seo,
    accessibility,
    competitorPositioning
  });

  return {
    pageType: page.pageType,
    ux,
    performance,
    seo,
    accessibility,
    conversion,
    competitorPositioning,
    overall
  };
}

function performanceScore(pages: ScoringPage[]) {
  const lighthouseAverage = average(pages.map((page) => getLighthouseSummary(page.lighthouse)?.performance));

  if (lighthouseAverage !== null) {
    return lighthouseAverage;
  }

  const detectorFallback = detectorScore(
    pages,
    ["technical_no_console_errors", "technical_no_failed_requests", "technical_dom_text_not_excessive", "technical_external_script_count_reasonable"],
    70
  );
  const failedRequestPenalty = averageCount(pages.map((page) => getArrayLength(page.failedRequests))) * 3;
  const consolePenalty = averageCount(pages.map((page) => getArrayLength(page.consoleErrors))) * 2;

  return clampScore(detectorFallback - failedRequestPenalty - consolePenalty);
}

function seoScore(pages: ScoringPage[]) {
  const lighthouseAverage = average(pages.map((page) => getLighthouseSummary(page.lighthouse)?.seo));
  const detectorAverage = detectorScore(pages, seoDetectorKeys, 65);

  if (lighthouseAverage === null) {
    return detectorAverage;
  }

  return clampScore(lighthouseAverage * 0.6 + detectorAverage * 0.4);
}

function accessibilityScore(pages: ScoringPage[]) {
  const lighthouseAverage = average(pages.map((page) => getLighthouseSummary(page.lighthouse)?.accessibility));
  const detectorAverage = detectorScore(pages, accessibilityDetectorKeys, 70);
  const axePenalty = averageCount(
    pages.map((page) => {
      const accessibility = getAccessibilitySummary(page.accessibility);

      if (!accessibility) {
        return 0;
      }

      return accessibility.criticalCount * 12 + accessibility.seriousCount * 7 + accessibility.moderateCount * 3 + accessibility.minorCount;
    })
  );
  const axeScore = clampScore(100 - axePenalty);

  if (lighthouseAverage === null) {
    return clampScore(detectorAverage * 0.55 + axeScore * 0.45);
  }

  return clampScore(lighthouseAverage * 0.45 + detectorAverage * 0.25 + axeScore * 0.3);
}

function competitorPositioningScore(pages: ScoringPage[], competitors: ScoringCompetitor[]) {
  const competitorPages = competitors.flatMap((competitor) => competitor.pages);

  if (competitorPages.length === 0) {
    return 50;
  }

  const customerDetectorRatio = detectorPassedRatio(pages);
  const competitorDetectorRatio = detectorPassedRatio(competitorPages);
  const customerPerformance = performanceScore(pages);
  const competitorPerformance = performanceScore(competitorPages);
  const customerSeo = seoScore(pages);
  const competitorSeo = seoScore(competitorPages);
  const customerAccessibility = accessibilityScore(pages);
  const competitorAccessibility = accessibilityScore(competitorPages);
  const detectorDelta = (customerDetectorRatio - competitorDetectorRatio) * 35;
  const technicalDelta =
    (customerPerformance - competitorPerformance) * 0.2 +
    (customerSeo - competitorSeo) * 0.15 +
    (customerAccessibility - competitorAccessibility) * 0.15;

  return clampScore(50 + detectorDelta + technicalDelta);
}

function weightedOverall(scorecard: Omit<AuditScorecard, "overall">) {
  return clampScore(
    scorecard.ux * weights.ux +
      scorecard.conversion * weights.conversion +
      scorecard.performance * weights.performance +
      scorecard.seo * weights.seo +
      scorecard.accessibility * weights.accessibility +
      scorecard.competitorPositioning * weights.competitorPositioning
  );
}

function detectorScore(pages: ScoringPage[], keys: string[], fallback: number) {
  const relevantDetectors = pages.flatMap((page) =>
    getDetectorResults(page.detectorResults).filter((detector) => keys.includes(detector.key))
  );

  if (relevantDetectors.length === 0) {
    return fallback;
  }

  const passedWeight = relevantDetectors.reduce((total, detector) => {
    return total + (detector.passed ? severityWeight(detector.severity) : 0);
  }, 0);
  const totalWeight = relevantDetectors.reduce((total, detector) => total + severityWeight(detector.severity), 0);

  return clampScore((passedWeight / totalWeight) * 100);
}

function detectorPassedRatio(pages: ScoringPage[]) {
  const detectors = pages.flatMap((page) => getDetectorResults(page.detectorResults));

  if (detectors.length === 0) {
    return 0.5;
  }

  return detectors.filter((detector) => detector.passed).length / detectors.length;
}

function getDetectorResults(value: unknown): DetectorResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is DetectorResult => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const candidate = item as Record<string, unknown>;

    return (
      typeof candidate.key === "string" &&
      typeof candidate.passed === "boolean" &&
      typeof candidate.severity === "string"
    );
  });
}

function getLighthouseSummary(value: unknown): LighthouseSummary | null {
  if (isTechnicalAuditError(value) || !value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<LighthouseSummary>;
  return typeof candidate.url === "string" ? (candidate as LighthouseSummary) : null;
}

function getAccessibilitySummary(value: unknown): AccessibilitySummary | null {
  if (isTechnicalAuditError(value) || !value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<AccessibilitySummary>;
  return typeof candidate.violationCount === "number" ? (candidate as AccessibilitySummary) : null;
}

function isTechnicalAuditError(value: unknown): value is TechnicalAuditError {
  return Boolean(value && typeof value === "object" && "error" in value);
}

function severityWeight(severity: DetectorResult["severity"]) {
  if (severity === "high") {
    return 3;
  }

  if (severity === "medium") {
    return 2;
  }

  return 1;
}

function average(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number");

  if (numbers.length === 0) {
    return null;
  }

  return numbers.reduce((total, value) => total + value, 0) / numbers.length;
}

function averageCount(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getArrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
