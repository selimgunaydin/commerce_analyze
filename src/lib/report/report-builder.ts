import type { AuditPage, AuditProject, AuditReport, Competitor, CompetitorPage, Opportunity } from "@prisma/client";
import {
  finalAuditReportSchema,
  type AuditOpportunity,
  type CompetitorComparison,
  type FinalAuditReport,
  type SiteProfile
} from "@/src/lib/ai/schemas";
import type { AuditScorecard } from "@/src/lib/audit/scoring";

type ProjectForReport = AuditProject & {
  pages: AuditPage[];
  competitors: Array<Competitor & { pages: CompetitorPage[] }>;
  opportunities: Opportunity[];
};

const fallbackScorecard: AuditScorecard = {
  ux: 0,
  performance: 0,
  seo: 0,
  accessibility: 0,
  conversion: 0,
  competitorPositioning: 0,
  overall: 0
};

export function buildFinalAuditReportDraft(params: {
  project: ProjectForReport;
  report: Pick<AuditReport, "scorecard" | "content"> | null;
}) {
  const scorecard = getScorecard(params.report?.scorecard) ?? fallbackScorecard;
  const siteProfile = getSiteProfile(params.project.siteProfile, params.project);
  const opportunities = params.project.opportunities.map(toAuditOpportunity);
  const quickWins = opportunities.filter(isQuickWinOpportunity);
  const strategicProjects = opportunities.filter(isStrategicProjectOpportunity);
  const competitorComparison = getCompetitorComparison(params.report?.content);
  const topFindings = buildTopFindings({
    scorecard,
    pages: params.project.pages,
    competitorComparison
  });
  const report = finalAuditReportSchema.parse({
    executiveSummary: buildExecutiveSummary({
      project: params.project,
      scorecard,
      opportunities,
      quickWins,
      strategicProjects,
      topFindings
    }),
    siteProfile,
    scorecard,
    topFindings,
    competitorSummary: buildCompetitorSummary(competitorComparison, params.project.competitors.length),
    opportunities,
    quickWins,
    strategicProjects,
    technicalAppendix: {
      lighthouse: params.project.pages.map((page) => ({
        url: page.url,
        pageType: page.pageType,
        lighthouse: page.lighthouse
      })),
      accessibility: params.project.pages.map((page) => ({
        url: page.url,
        pageType: page.pageType,
        accessibility: page.accessibility
      })),
      crawledPages: params.project.pages.map((page) => page.url),
      screenshots: params.project.pages.flatMap((page) => [page.screenshotPath, page.mobileScreenshotPath]).filter(isString)
    }
  });

  return report;
}

export function preserveStoredOpportunities(report: FinalAuditReport, opportunities: Opportunity[]) {
  const storedOpportunities = opportunities.map(toAuditOpportunity);

  return finalAuditReportSchema.parse({
    ...report,
    opportunities: storedOpportunities,
    quickWins: storedOpportunities.filter(isQuickWinOpportunity),
    strategicProjects: storedOpportunities.filter(isStrategicProjectOpportunity)
  });
}

export function buildMarkdownReport(report: FinalAuditReport) {
  return [
    "# AI Commerce Audit Raporu",
    "",
    "## Yönetici Özeti",
    "",
    report.executiveSummary,
    "",
    "## Skor Kartı",
    "",
    scorecardMarkdown(report.scorecard),
    "",
    "## Öne Çıkan Bulgular",
    "",
    listMarkdown(report.topFindings),
    "",
    "## Rakip Özeti",
    "",
    report.competitorSummary,
    "",
    "## Hızlı Kazanımlar",
    "",
    opportunityMarkdown(report.quickWins),
    "",
    "## Stratejik Projeler",
    "",
    opportunityMarkdown(report.strategicProjects),
    "",
    "## Tüm Fırsatlar",
    "",
    opportunityMarkdown(report.opportunities),
    "",
    "## Teknik Ek",
    "",
    `Crawl edilen sayfalar: ${report.technicalAppendix.crawledPages.length}`,
    "",
    listMarkdown(report.technicalAppendix.crawledPages),
    "",
    `Ekran görüntüleri: ${report.technicalAppendix.screenshots.length}`,
    "",
    listMarkdown(report.technicalAppendix.screenshots)
  ].join("\n");
}

export function isQuickWinOpportunity(opportunity: Pick<AuditOpportunity, "estimatedEffort" | "expectedImpact" | "implementationComplexity">) {
  return (
    (opportunity.estimatedEffort === "half_day" || opportunity.estimatedEffort === "1_day") &&
    (opportunity.expectedImpact === "medium" || opportunity.expectedImpact === "high") &&
    (opportunity.implementationComplexity === "low" || opportunity.implementationComplexity === "medium")
  );
}

export function isStrategicProjectOpportunity(
  opportunity: Pick<AuditOpportunity, "estimatedEffort" | "expectedImpact" | "implementationComplexity">
) {
  return (
    (opportunity.estimatedEffort === "1_week" || opportunity.estimatedEffort === "2_weeks_plus") &&
    opportunity.expectedImpact === "high" &&
    (opportunity.implementationComplexity === "medium" || opportunity.implementationComplexity === "high")
  );
}

export function toAuditOpportunity(opportunity: Opportunity): AuditOpportunity {
  return {
    title: opportunity.title,
    description: opportunity.description,
    evidence: getStringArray(opportunity.evidence),
    affectedPages: getStringArray(opportunity.affectedPages),
    category: normalizeEnum(opportunity.category, [
      "ux",
      "ui",
      "performance",
      "seo",
      "accessibility",
      "conversion",
      "frontend",
      "analytics",
      "content",
      "merchandising"
    ]),
    priority: normalizeEnum(opportunity.priority, ["low", "medium", "high", "critical"]),
    estimatedEffort: normalizeEnum(opportunity.estimatedEffort, ["half_day", "1_day", "2_3_days", "1_week", "2_weeks_plus"]),
    expectedImpact: normalizeEnum(opportunity.expectedImpact, ["low", "medium", "high"]),
    implementationComplexity: normalizeEnum(opportunity.implementationComplexity, ["low", "medium", "high"]),
    suggestedImplementation: opportunity.suggestedImplementation ?? "Görevi referans verilen kanıta göre uygulayın.",
    acceptanceCriteria: getStringArray(opportunity.acceptanceCriteria),
    relatedCompetitorExamples: getStringArray(opportunity.relatedCompetitorExamples)
  };
}

function buildExecutiveSummary(params: {
  project: AuditProject;
  scorecard: AuditScorecard;
  opportunities: AuditOpportunity[];
  quickWins: AuditOpportunity[];
  strategicProjects: AuditOpportunity[];
  topFindings: string[];
}) {
  const brand = params.project.brandName ?? params.project.normalizedUrl;
  const firstFinding = params.topFindings[0] ?? "Audit, crawler ve teknik kanıtlarla desteklenen uygulama fırsatları buldu.";

  return `${brand} genel audit skoru ${Math.round(params.scorecard.overall)} ile tamamlandı. ${firstFinding} Raporda ${
    params.opportunities.length
  } uygulamaya hazır fırsat var; bunların ${params.quickWins.length} tanesi hızlı kazanım, ${
    params.strategicProjects.length
  } tanesi stratejik proje.`;
}

function buildCompetitorSummary(competitorComparison: CompetitorComparison | null, competitorCount: number) {
  if (!competitorComparison || competitorCount === 0) {
    return "Bu rapor için manuel rakip karşılaştırması bulunmuyor.";
  }

  return `${competitorComparison.summary} Kanıta dayalı ${competitorComparison.gaps.length} rakip açığı tespit edildi.`;
}

function buildTopFindings(params: {
  scorecard: AuditScorecard;
  pages: AuditPage[];
  competitorComparison: CompetitorComparison | null;
}) {
  const findings: string[] = [];

  for (const [key, value] of Object.entries(params.scorecard)) {
    if (key !== "overall" && typeof value === "number" && value < 60) {
      findings.push(`${formatToken(key)} skoru hedefin altında: ${Math.round(value)}.`);
    }
  }

  for (const gap of params.competitorComparison?.gaps ?? []) {
    findings.push(`Rakip açığı: ${gap.area}. ${gap.recommendation}`);
  }

  for (const page of params.pages) {
    for (const detector of getDetectorResults(page.detectorResults).filter((item) => !item.passed && item.severity !== "info").slice(0, 3)) {
      findings.push(`${formatPageType(page.pageType)} sayfasında dikkat isteyen kontrol: ${detector.label}.`);
    }
  }

  return Array.from(new Set(findings)).slice(0, 10);
}

function getScorecard(value: unknown): AuditScorecard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const keys: Array<keyof AuditScorecard> = [
    "ux",
    "performance",
    "seo",
    "accessibility",
    "conversion",
    "competitorPositioning",
    "overall"
  ];

  if (!keys.every((key) => typeof candidate[key] === "number")) {
    return null;
  }

  return candidate as AuditScorecard;
}

function getSiteProfile(value: unknown, project: AuditProject): SiteProfile {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;

    if (
      typeof candidate.likelyIndustry === "string" &&
      typeof candidate.ecommerceType === "string" &&
      typeof candidate.targetAudience === "string" &&
      typeof candidate.confidence === "number" &&
      Array.isArray(candidate.mainProductCategories) &&
      Array.isArray(candidate.reasoning)
    ) {
      return candidate as SiteProfile;
    }
  }

  return {
    brandName: project.brandName,
    likelyIndustry: project.industry ?? "Bilinmeyen e-ticaret",
    ecommerceType: "other",
    targetAudience: "Genel e-ticaret müşterileri",
    pricePositioning: "unknown",
    mainProductCategories: [],
    businessModel: "unknown",
    confidence: 0.1,
    reasoning: ["Doğrulanmış AI site profili bulunmadığı için fallback site profili kullanıldı."]
  };
}

function getCompetitorComparison(value: unknown): CompetitorComparison | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const content = value as Record<string, unknown>;
  const comparison = content.competitorComparison;

  if (!comparison || typeof comparison !== "object" || Array.isArray(comparison)) {
    return null;
  }

  return comparison as CompetitorComparison;
}

function getDetectorResults(value: unknown): Array<{ label: string; passed: boolean; severity: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is { label: string; passed: boolean; severity: string } => {
    return (
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).label === "string" &&
      typeof (item as Record<string, unknown>).passed === "boolean" &&
      typeof (item as Record<string, unknown>).severity === "string"
    );
  });
}

function scorecardMarkdown(scorecard: AuditScorecard) {
  return [
    `- Genel: ${Math.round(scorecard.overall)}`,
    `- UX: ${Math.round(scorecard.ux)}`,
    `- Dönüşüm: ${Math.round(scorecard.conversion)}`,
    `- Performans: ${Math.round(scorecard.performance)}`,
    `- SEO: ${Math.round(scorecard.seo)}`,
    `- Erişilebilirlik: ${Math.round(scorecard.accessibility)}`,
    `- Rakip Konumu: ${Math.round(scorecard.competitorPositioning)}`
  ].join("\n");
}

function opportunityMarkdown(opportunities: AuditOpportunity[]) {
  if (opportunities.length === 0) {
    return "- Yok.";
  }

  return opportunities
    .map((opportunity) =>
      [
        `### ${opportunity.title}`,
        "",
        opportunity.description,
        "",
        `- Kategori: ${formatToken(opportunity.category)}`,
        `- Öncelik: ${formatToken(opportunity.priority)}`,
        `- Efor: ${formatToken(opportunity.estimatedEffort)}`,
        `- Etki: ${formatToken(opportunity.expectedImpact)}`,
        `- Karmaşıklık: ${formatToken(opportunity.implementationComplexity)}`,
        `- Kanıt: ${opportunity.evidence.join(" | ")}`,
        `- Kabul Kriterleri: ${opportunity.acceptanceCriteria.join(" | ")}`
      ].join("\n")
    )
    .join("\n\n");
}

function listMarkdown(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- Yok.";
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isString) : [];
}

function normalizeEnum<const T extends string>(value: string, allowed: readonly T[]) {
  return allowed.includes(value as T) ? (value as T) : allowed[0];
}

function formatToken(value: string) {
  const labels: Record<string, string> = {
    overall: "Genel",
    ux: "UX",
    performance: "Performans",
    seo: "SEO",
    accessibility: "Erişilebilirlik",
    conversion: "Dönüşüm",
    competitorPositioning: "Rakip Konumu",
    ui: "UI",
    frontend: "Frontend",
    analytics: "Analitik",
    content: "İçerik",
    merchandising: "Ürün Sunumu",
    low: "Düşük",
    medium: "Orta",
    high: "Yüksek",
    critical: "Kritik",
    half_day: "Yarım Gün",
    "1_day": "1 Gün",
    "2_3_days": "2-3 Gün",
    "1_week": "1 Hafta",
    "2_weeks_plus": "2+ Hafta"
  };

  return (
    labels[value] ??
    value
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function formatPageType(value: string) {
  const labels: Record<string, string> = {
    home: "Ana sayfa",
    plp: "Listeleme",
    pdp: "Ürün detay",
    search: "Arama",
    campaign: "Kampanya",
    content: "İçerik",
    unknown: "Bilinmeyen"
  };

  return labels[value] ?? value.toUpperCase();
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
