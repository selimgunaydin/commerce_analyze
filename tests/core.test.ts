import assert from "node:assert/strict";
import test from "node:test";
import { AuditDepth } from "@prisma/client";
import { auditOpportunitySchema } from "@/src/lib/ai/schemas";
import { runEcommerceDetectors } from "@/src/lib/audit/ecommerce-detectors";
import { classifyLinkCandidate } from "@/src/lib/audit/page-classifier";
import { createPageDiscoveryPlan } from "@/src/lib/audit/page-discovery";
import { calculateAuditScorecard, calculatePageScorecard } from "@/src/lib/audit/scoring";
import type { ExtractedPageData } from "@/src/lib/audit/types";
import { buildMarkdownReport } from "@/src/lib/report/report-builder";
import { normalizeUrlForDiscovery } from "@/src/lib/utils/url-normalizer";
import { UrlValidationError, validateAndNormalizeUrl } from "@/src/lib/utils/url-validation";

test("URL validation blocks private targets and normalizes safe URLs", async () => {
  await assert.rejects(() => validateAndNormalizeUrl("http://127.0.0.1:3000"), UrlValidationError);
  await assert.rejects(() => validateAndNormalizeUrl("http://169.254.169.254/latest/meta-data"), UrlValidationError);
  await assert.rejects(() => validateAndNormalizeUrl("http://[fe90::1]/"), UrlValidationError);

  const validated = await validateAndNormalizeUrl("https://example.com:443/path#section");
  assert.equal(validated.normalizedUrl, "https://example.com/path");
});

test("URL normalization strips tracking params and hash fragments", () => {
  const normalized = normalizeUrlForDiscovery(
    "https://example.com/category?utm_source=x&b=2&a=1#top",
    "https://example.com/"
  );

  assert.equal(normalized, "https://example.com/category?a=1&b=2");
});

test("Page classifier and discovery select PLP/PDP candidates", () => {
  const plpClassification = classifyLinkCandidate({
    url: "https://shop.test/category/shoes",
    normalizedUrl: "https://shop.test/category/shoes",
    text: "Shoes",
    texts: ["Shoes"]
  });
  const pdpClassification = classifyLinkCandidate({
    url: "https://shop.test/product/sneaker-1",
    normalizedUrl: "https://shop.test/product/sneaker-1",
    text: "Sneaker",
    texts: ["Sneaker"]
  });

  assert.equal(plpClassification.pageType, "plp");
  assert.equal(pdpClassification.pageType, "pdp");

  const plan = createPageDiscoveryPlan({
    depth: AuditDepth.STANDARD,
    baseUrl: "https://shop.test/",
    homepage: extractedPage({
      links: [
        { href: "https://shop.test/category/shoes", text: "Shoes" },
        { href: "https://shop.test/product/sneaker-1", text: "Sneaker" }
      ]
    })
  });

  assert.equal(plan.candidates.length, 2);
});

test("Detector engine finds PDP add-to-cart and technical checks", () => {
  const detectors = runEcommerceDetectors({
    pageType: "pdp",
    extracted: extractedPage({
      visibleText: "Sneaker $99 In stock Shipping and returns Product description Sticky add to cart Earn loyalty points",
      headings: {
        h1: ["Sneaker"],
        h2: [],
        h3: []
      },
      buttons: [{ text: "Add to cart" }],
      images: [
        { src: "/one.jpg", alt: "Product front" },
        { src: "/two.jpg", alt: "Product side" },
        { src: "/three.jpg", alt: "Product detail" }
      ]
    })
  });

  assert.equal(detectors.find((detector) => detector.key === "pdp_has_add_to_cart")?.passed, true);
  assert.equal(detectors.find((detector) => detector.key === "pdp_has_sticky_add_to_cart")?.passed, true);
  assert.equal(detectors.find((detector) => detector.key === "pdp_has_loyalty_value")?.passed, true);
  assert.equal(detectors.find((detector) => detector.key === "technical_has_h1")?.passed, true);
});

test("Scoring engine returns deterministic scorecard", () => {
  const scorecard = calculateAuditScorecard({
    pages: [
      {
        pageType: "home",
        detectorResults: [
          { key: "homepage_has_cta", passed: true, severity: "medium" },
          { key: "technical_has_meta_description", passed: false, severity: "medium" }
        ]
      }
    ],
    competitors: []
  });

  assert.equal(typeof scorecard.overall, "number");
  assert.equal(scorecard.competitorPositioning, 50);

  const pageScore = calculatePageScorecard({
    pageType: "home",
    detectorResults: [{ key: "homepage_has_cta", passed: true, severity: "medium" }]
  });
  assert.equal(pageScore.pageType, "home");
  assert.equal(typeof pageScore.overall, "number");
});

test("Opportunity schema validates roadmap task shape", () => {
  const parsed = auditOpportunitySchema.parse({
    title: "Add homepage CTA",
    description: "Homepage detector evidence shows no primary CTA.",
    evidence: ["HOME detector: homepage_has_cta=false"],
    affectedPages: ["home"],
    category: "conversion",
    customerJourneyStage: "purchase",
    customerProblem: "Müşteri ana sayfada alışverişe nereden başlayacağını hızlı anlayamıyor.",
    customerBenefit: "Müşteri ana aksiyona daha hızlı ulaşır.",
    businessRationale: "Net CTA dönüşüm akışına giriş oranını artırabilir.",
    priority: "high",
    estimatedEffort: "1_day",
    expectedImpact: "high",
    implementationComplexity: "medium",
    suggestedImplementation: "Add a primary CTA above the fold.",
    acceptanceCriteria: ["CTA is visible on desktop and mobile."],
    relatedCompetitorExamples: []
  });

  assert.equal(parsed.category, "conversion");
});

test("Final report markdown builder keeps required headings", () => {
  const opportunity = auditOpportunitySchema.parse({
    title: "Add homepage CTA",
    description: "Homepage detector evidence shows no primary CTA.",
    evidence: ["HOME detector: homepage_has_cta=false"],
    affectedPages: ["home"],
    category: "conversion",
    customerJourneyStage: "purchase",
    customerProblem: "Müşteri ana sayfada alışverişe nereden başlayacağını hızlı anlayamıyor.",
    customerBenefit: "Müşteri ana aksiyona daha hızlı ulaşır.",
    businessRationale: "Net CTA dönüşüm akışına giriş oranını artırabilir.",
    priority: "high",
    estimatedEffort: "1_day",
    expectedImpact: "high",
    implementationComplexity: "medium",
    suggestedImplementation: "Add a primary CTA above the fold.",
    acceptanceCriteria: ["CTA is visible on desktop and mobile."],
    relatedCompetitorExamples: []
  });
  const markdown = buildMarkdownReport({
    executiveSummary: "Overall score is low with conversion gaps.",
    siteProfile: {
      brandName: "Shop",
      likelyIndustry: "Fashion",
      ecommerceType: "fashion",
      targetAudience: "Shoppers",
      pricePositioning: "mid",
      mainProductCategories: [],
      businessModel: "b2c",
      confidence: 0.8,
      reasoning: ["Homepage title evidence."]
    },
    scorecard: {
      ux: 60,
      performance: 90,
      seo: 80,
      accessibility: 85,
      conversion: 30,
      competitorPositioning: 50,
      overall: 61
    },
    topFindings: ["Conversion score is below target."],
    competitorSummary: "No competitor comparison available.",
    opportunities: [opportunity],
    quickWins: [opportunity],
    strategicProjects: [],
    technicalAppendix: {
      lighthouse: [],
      accessibility: [],
      crawledPages: ["https://shop.test/"],
      screenshots: ["audits/test/home-desktop.png"]
    }
  });

  assert.match(markdown, /## Yönetici Özeti/);
  assert.match(markdown, /## Hızlı Kazanımlar/);
  assert.match(markdown, /## Tüm Fırsatlar/);
  assert.match(markdown, /## Teknik Ek/);
});

function extractedPage(overrides: Partial<ExtractedPageData> = {}): ExtractedPageData {
  return {
    url: "https://shop.test/",
    finalUrl: "https://shop.test/",
    title: "Shop",
    metaDescription: "Shop test",
    visibleText: "Shop test",
    headings: {
      h1: ["Shop"],
      h2: [],
      h3: []
    },
    links: [],
    buttons: [],
    forms: [],
    consoleErrors: [],
    failedRequests: [],
    images: [],
    scripts: [],
    ...overrides
  };
}
