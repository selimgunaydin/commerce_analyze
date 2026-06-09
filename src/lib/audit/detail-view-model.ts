import { AuditStatus, type AuditPage, type AuditProject, type AuditReport, type Competitor, type CompetitorPage, type Opportunity } from "@prisma/client";
import type { CompetitorComparison, PageUXAnalysis, SiteProfile } from "@/src/lib/ai/schemas";
import type { DetectorResult } from "@/src/lib/audit/ecommerce-detectors";
import type { AccessibilitySummary, LighthouseSummary, TechnicalAuditError } from "@/src/lib/audit/technical-audit-normalizer";
import type { AuditScorecard } from "@/src/lib/audit/scoring";

export type AuditDetailProject = AuditProject & {
  pages: AuditPage[];
  competitors: Array<Competitor & { pages: CompetitorPage[] }>;
  reports: AuditReport[];
  opportunities: Opportunity[];
};

export const activeAuditStatuses = new Set<AuditStatus>([
  AuditStatus.QUEUED,
  AuditStatus.CRAWLING,
  AuditStatus.AUDITING,
  AuditStatus.COMPETITOR_ANALYSIS,
  AuditStatus.AI_ANALYSIS
]);

export const auditStatusOrder: AuditStatus[] = [
  AuditStatus.QUEUED,
  AuditStatus.CRAWLING,
  AuditStatus.AUDITING,
  AuditStatus.COMPETITOR_ANALYSIS,
  AuditStatus.AI_ANALYSIS,
  AuditStatus.REPORT_READY
];

export const pageTypeOrder = ["home", "plp", "pdp", "search", "campaign", "content", "unknown"];

export function buildAuditDetailModel(audit: AuditDetailProject) {
  const latestReport = audit.reports[0] ?? null;
  const scorecard = getScorecard(latestReport?.scorecard);
  const siteProfile = getSiteProfile(audit.siteProfile);
  const competitorComparison = getCompetitorComparison(latestReport?.content);
  const pagesByType = groupPagesByType(audit.pages);
  const failedCheckCount = audit.pages.reduce((total, page) => total + getFailedDetectorResults(page.detectorResults).length, 0);
  const screenshotCount = audit.pages.reduce((total, page) => total + (page.screenshotPath ? 1 : 0) + (page.mobileScreenshotPath ? 1 : 0), 0);
  const quickWins = audit.opportunities.filter(isQuickWinOpportunity);
  const strategicProjects = audit.opportunities.filter(isStrategicProjectOpportunity);
  const criticalOpportunities = audit.opportunities.filter((item) => item.priority === "critical" || item.priority === "high");

  return {
    competitorComparison,
    criticalOpportunities,
    failedCheckCount,
    isLegacyStalled: activeAuditStatuses.has(audit.status) && !audit.activeRunId && audit.status !== AuditStatus.QUEUED,
    isRunning: activeAuditStatuses.has(audit.status) && Boolean(audit.activeRunId),
    latestReport,
    pagesByType,
    quickWins,
    scorecard,
    screenshotCount,
    siteProfile,
    strategicProjects,
    topPageIssues: buildTopPageIssues(audit.pages)
  };
}

export function buildSalesPackages(opportunities: Opportunity[]) {
  const packages = [
    {
      title: "Conversion Sprint",
      description: "CTA, sepet, ürün detay ve satın alma sürtünmelerini kapatan 1-2 haftalık uygulama paketi.",
      categoryMatchers: ["conversion"],
      keyword: /(cta|cart|sepet|checkout|purchase|sticky|price|fiyat)/i
    },
    {
      title: "UX Discovery Fix Pack",
      description: "Ana sayfa, kategori, arama ve navigasyon bulgularını hızlı kazanıma dönüştüren paket.",
      categoryMatchers: ["ux", "merchandising"],
      keyword: /(hero|category|kategori|search|arama|navigation|menu|filter|sort)/i
    },
    {
      title: "Trust & Retention Pack",
      description: "Güven, yorum, kargo/iade, favori ve sadakat sinyallerini güçlendiren paket.",
      categoryMatchers: ["trust", "retention"],
      keyword: /(trust|güven|guven|review|yorum|shipping|kargo|return|iade|wishlist|favori|loyalty|sadakat)/i
    },
    {
      title: "Technical Hygiene Pack",
      description: "Performans, SEO, erişilebilirlik ve frontend kalite sorunlarını kapatan teknik iyileştirme paketi.",
      categoryMatchers: ["performance", "seo", "accessibility", "frontend"],
      keyword: /(lighthouse|performance|seo|accessibility|erişilebilir|console|network|meta|h1|alt)/i
    }
  ];

  return packages
    .map((item) => {
      const matched = opportunities.filter((opportunity) => {
        const text = `${opportunity.title} ${opportunity.description} ${opportunity.suggestedImplementation ?? ""}`;
        return item.categoryMatchers.includes(opportunity.category) || item.keyword.test(text);
      });

      return {
        ...item,
        effort: matched.reduce((total, opportunity) => total + effortWeight(opportunity.estimatedEffort), 0),
        opportunities: matched
      };
    })
    .filter((item) => item.opportunities.length > 0)
    .sort((left, right) => right.opportunities.length - left.opportunities.length);
}

export function getScorecard(value: unknown): AuditScorecard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  const keys: Array<keyof AuditScorecard> = ["ux", "performance", "seo", "accessibility", "conversion", "competitorPositioning", "overall"];

  if (!keys.every((key) => typeof candidate[key] === "number")) return null;
  return candidate as AuditScorecard;
}

export function getSiteProfile(value: unknown): SiteProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.likelyIndustry !== "string" ||
    typeof candidate.ecommerceType !== "string" ||
    typeof candidate.targetAudience !== "string" ||
    typeof candidate.confidence !== "number" ||
    !Array.isArray(candidate.mainProductCategories)
  ) {
    return null;
  }

  return candidate as SiteProfile;
}

export function getCompetitorComparison(value: unknown): CompetitorComparison | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const content = value as Record<string, unknown>;
  const candidate = content.competitorComparison;

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;

  const comparison = candidate as Record<string, unknown>;
  if (typeof comparison.summary !== "string" || !Array.isArray(comparison.gaps)) return null;

  return candidate as CompetitorComparison;
}

export function getPageUXAnalysis(value: unknown): PageUXAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.summary !== "string" || typeof candidate.priorityScore !== "number") return null;

  return candidate as PageUXAnalysis;
}

export function getFailedDetectorResults(value: unknown): DetectorResult[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDetectorResult).filter((detector) => !detector.passed && detector.severity !== "info").sort(sortDetectorBySeverity);
}

export function getLighthouseSummary(value: unknown): LighthouseSummary | TechnicalAuditError | null {
  if (isTechnicalAuditError(value) || isLighthouseSummary(value)) return value;
  return null;
}

export function getAccessibilitySummary(value: unknown): AccessibilitySummary | TechnicalAuditError | null {
  if (isTechnicalAuditError(value) || isAccessibilitySummary(value)) return value;
  return null;
}

export function groupPagesByType(pages: AuditPage[]) {
  const groupedPages = new Map<string, AuditPage[]>();

  for (const page of pages) {
    const existingPages = groupedPages.get(page.pageType) ?? [];
    existingPages.push(page);
    groupedPages.set(page.pageType, existingPages);
  }

  return groupedPages;
}

export function getJsonArrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

export function getStringArrayFromJson(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function getHeadingCount(value: unknown, key: "h1" | "h2" | "h3") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const headings = value as Record<string, unknown>;
  return Array.isArray(headings[key]) ? headings[key].length : 0;
}

export function getStorageUrl(storagePath: string | null) {
  if (!storagePath) return null;
  if (storagePath.startsWith("/") || storagePath.startsWith("http://") || storagePath.startsWith("https://")) return storagePath;

  const prefix = (process.env.LOCAL_STORAGE_PUBLIC_URL_PREFIX ?? "/storage").replace(/\/$/, "");
  return `${prefix}/${storagePath}`;
}

export function formatStatus(status: AuditStatus) {
  const labels: Record<AuditStatus, string> = {
    QUEUED: "Sırada",
    CRAWLING: "Crawl",
    AUDITING: "Teknik Audit",
    COMPETITOR_ANALYSIS: "Rakip Analizi",
    AI_ANALYSIS: "AI Analizi",
    REPORT_READY: "Rapor Hazır",
    FAILED: "Hata",
    CANCELED: "İptal Edildi"
  };

  return labels[status];
}

export function statusDescription(status: AuditStatus) {
  const descriptions: Record<AuditStatus, string> = {
    QUEUED: "Audit kuyruğa alındı.",
    CRAWLING: "Site sayfaları ve ekran görüntüleri toplanıyor.",
    AUDITING: "Lighthouse, erişilebilirlik ve detector kontrolleri çalışıyor.",
    COMPETITOR_ANALYSIS: "Manuel rakip sayfaları analiz ediliyor.",
    AI_ANALYSIS: "AI site profili, fırsatlar ve rapor içeriği üretiyor.",
    REPORT_READY: "Audit tamamlandı, rapor görüntülenebilir.",
    FAILED: "Audit tamamlanmadan hata verdi.",
    CANCELED: "Audit kullanıcı tarafından iptal edildi."
  };

  return descriptions[status];
}

export function formatDepth(depth: string) {
  const labels: Record<string, string> = {
    QUICK: "Hızlı",
    STANDARD: "Standart",
    DEEP: "Derin"
  };

  return labels[depth] ?? depth;
}

export function formatPageType(pageType: string) {
  const labels: Record<string, string> = {
    home: "Ana sayfa",
    plp: "Listeleme",
    pdp: "Ürün detay",
    search: "Arama",
    campaign: "Kampanya",
    content: "İçerik",
    unknown: "Bilinmeyen"
  };

  return labels[pageType] ?? pageType.toUpperCase();
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function formatMetricMs(value?: number) {
  if (typeof value !== "number") return "-";
  return `${Math.round(value)} ms`;
}

export function formatMetricNumber(value?: number) {
  if (typeof value !== "number") return "-";
  return value.toFixed(3);
}

export function formatToken(value: string) {
  const labels: Record<string, string> = {
    ux: "UX",
    ui: "UI",
    performance: "Performans",
    seo: "SEO",
    accessibility: "Erişilebilirlik",
    conversion: "Dönüşüm",
    retention: "Sadakat",
    trust: "Güven",
    frontend: "Frontend",
    analytics: "Analitik",
    content: "İçerik",
    merchandising: "Ürün Sunumu",
    low: "Düşük",
    medium: "Orta",
    high: "Yüksek",
    critical: "Kritik",
    half_day: "Yarım gün",
    "1_day": "1 gün",
    "2_3_days": "2-3 gün",
    "1_week": "1 hafta",
    "2_weeks_plus": "2+ hafta",
    discovery: "Keşif",
    evaluation: "Değerlendirme",
    purchase: "Satın alma",
    post_purchase: "Satın alma sonrası"
  };

  return labels[value] ?? value;
}

export function scoreHint(value: number) {
  if (value >= 85) return "Güçlü";
  if (value >= 65) return "İyileştirilebilir";
  return "Öncelikli çalışma gerekir";
}

export function isQuickWinOpportunity(opportunity: Pick<Opportunity, "estimatedEffort" | "expectedImpact" | "implementationComplexity">) {
  return (
    (opportunity.estimatedEffort === "half_day" || opportunity.estimatedEffort === "1_day") &&
    (opportunity.expectedImpact === "medium" || opportunity.expectedImpact === "high") &&
    (opportunity.implementationComplexity === "low" || opportunity.implementationComplexity === "medium")
  );
}

export function isStrategicProjectOpportunity(opportunity: Pick<Opportunity, "estimatedEffort" | "expectedImpact" | "implementationComplexity">) {
  return (
    (opportunity.estimatedEffort === "1_week" || opportunity.estimatedEffort === "2_weeks_plus") &&
    opportunity.expectedImpact === "high" &&
    (opportunity.implementationComplexity === "medium" || opportunity.implementationComplexity === "high")
  );
}

export function detectorIssueTitle(detector: DetectorResult) {
  const labels: Record<string, string> = {
    homepage_has_hero: "Ana sayfada hero alanı ve ana aksiyon zayıf",
    homepage_has_h1: "Ana sayfada H1 başlığı eksik",
    homepage_has_category_shortcuts: "Kategori kısayolları yetersiz",
    homepage_has_cta: "Ana sayfada ana aksiyon çağrısı zayıf",
    homepage_has_search_input: "Ana sayfada arama alanı eksik",
    homepage_has_trust_badge: "Ana sayfada güven unsuru zayıf",
    homepage_has_delivery_return_value: "Kargo/iade avantajı yeterince görünür değil",
    homepage_has_mobile_menu_signal: "Mobil menü sinyali zayıf",
    homepage_has_footer_links: "Footer destek linkleri zayıf",
    technical_has_h1: "H1 başlığı eksik",
    technical_has_meta_description: "Meta açıklama eksik",
    technical_images_have_alt: "Görsel alt metinleri eksik",
    technical_buttons_have_accessible_name: "Bazı butonların erişilebilir adı yok",
    technical_links_have_text: "Bazı linklerde anlaşılır metin yok",
    pdp_has_add_to_cart: "Sepete ekleme aksiyonu zayıf",
    pdp_has_shipping_return_info: "Kargo/iade bilgisi eksik",
    pdp_has_wishlist: "Ürün detayında favoriye ekleme sinyali yok",
    pdp_has_sticky_add_to_cart: "Sabit sepete ekle sinyali yok",
    plp_has_product_grid: "Ürün grid yapısı zayıf",
    plp_has_filter: "Filtreleme sinyali eksik",
    plp_has_sort: "Sıralama sinyali eksik",
    plp_has_wishlist: "Listelemede favoriye ekleme sinyali yok"
  };

  return labels[detector.key] ?? detector.label;
}

function buildTopPageIssues(pages: AuditPage[]) {
  return pages
    .flatMap((page) =>
      getFailedDetectorResults(page.detectorResults)
        .filter((detector) => detector.severity === "high")
        .slice(0, 2)
        .map((detector) => ({
          detector,
          page
        }))
    )
    .slice(0, 6);
}

function effortWeight(value: string) {
  const weights: Record<string, number> = {
    half_day: 0.5,
    "1_day": 1,
    "2_3_days": 3,
    "1_week": 5,
    "2_weeks_plus": 10
  };

  return weights[value] ?? 1;
}

function sortDetectorBySeverity(left: DetectorResult, right: DetectorResult) {
  return severityRank(right.severity) - severityRank(left.severity);
}

function severityRank(severity: DetectorResult["severity"]) {
  return severity === "high" ? 3 : severity === "medium" ? 2 : severity === "low" ? 1 : 0;
}

function isDetectorResult(value: unknown): value is DetectorResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.key === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.passed === "boolean" &&
    typeof candidate.confidence === "number" &&
    (candidate.severity === "info" || candidate.severity === "low" || candidate.severity === "medium" || candidate.severity === "high") &&
    Array.isArray(candidate.evidence)
  );
}

function isTechnicalAuditError(value: unknown): value is TechnicalAuditError {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const error = (value as Record<string, unknown>).error as Record<string, unknown> | undefined;
  return Boolean(error && typeof error.message === "string" && typeof error.source === "string");
}

function isLighthouseSummary(value: unknown): value is LighthouseSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.url === "string" && typeof candidate.metrics === "object" && Array.isArray(candidate.opportunities);
}

function isAccessibilitySummary(value: unknown): value is AccessibilitySummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.violationCount === "number" && Array.isArray(candidate.violations);
}
