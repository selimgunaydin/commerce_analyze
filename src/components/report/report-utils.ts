import type { AuditPage } from "@prisma/client";
import type { AuditOpportunity, FinalAuditReport } from "@/src/lib/ai/schemas";

export function getPagesByType(pages: AuditPage[]) {
  return {
    homePages: pages.filter((page) => page.pageType === "home"),
    plpPages: pages.filter((page) => page.pageType === "plp"),
    pdpPages: pages.filter((page) => page.pageType === "pdp")
  };
}

export function dedupeOpportunities(opportunities: FinalAuditReport["opportunities"]) {
  const byKey = new Map<string, FinalAuditReport["opportunities"][number]>();
  const deduped: FinalAuditReport["opportunities"] = [];

  for (const opportunity of opportunities) {
    const key = opportunityClusterKey(opportunity);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, opportunity);
      deduped.push(opportunity);
      continue;
    }

    existing.evidence = uniqueStrings([...existing.evidence, ...opportunity.evidence]).slice(0, 12);
    existing.affectedPages = uniqueStrings([...existing.affectedPages, ...opportunity.affectedPages]).slice(0, 12);
    existing.acceptanceCriteria = uniqueStrings([...existing.acceptanceCriteria, ...opportunity.acceptanceCriteria]).slice(0, 8);
    existing.relatedCompetitorExamples = uniqueStrings([...existing.relatedCompetitorExamples, ...opportunity.relatedCompetitorExamples]).slice(0, 8);
  }

  return deduped;
}

export function failedDetectorLabels(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).passed === false)
    .map((item) => (item as Record<string, unknown>).label)
    .filter((item): item is string => typeof item === "string");
}

export function technicalSummaryItems(kind: "performance" | "seo" | "accessibility", pages: AuditPage[]) {
  return pages.map((page) => {
    const lighthouse = asRecord(page.lighthouse);
    const accessibility = asRecord(page.accessibility);

    if (kind === "accessibility") {
      return `${formatPageType(page.pageType)}: axe ihlal ${accessibility?.violationCount ?? "yok"}, Lighthouse erişilebilirlik ${lighthouse?.accessibility ?? "yok"}`;
    }

    return `${formatPageType(page.pageType)}: Lighthouse ${kind} ${lighthouse?.[kind] ?? "n/a"}`;
  });
}

export function pmDecisionForOpportunity(opportunity: AuditOpportunity) {
  const pageScope = opportunity.affectedPages.map(formatPageType).join(", ");

  if (opportunity.category === "performance") {
    return `${pageScope} için hedeflenecek performans metriğini ve kabul edilebilir teknik borç sınırını belirle.`;
  }

  if (opportunity.category === "accessibility") {
    return `${pageScope} erişilebilirlik düzeltmesini yayın önceliğine al ve tekrar audit sonucu olmadan kapatma.`;
  }

  if (opportunity.relatedCompetitorExamples.length > 0 || opportunity.title.startsWith("Rakip açığını kapat")) {
    return `${pageScope} için rakip paterninin marka deneyimine uyarlanacak kapsamını ve başarı metriğini netleştir.`;
  }

  return `${pageScope} kapsamını, başarı metriğini ve doğrulama auditini netleştir.`;
}

export function screenshotEvidenceForOpportunity(opportunity: AuditOpportunity, screenshots: string[]) {
  const pageTypes = opportunity.affectedPages.filter((page) => page !== "audit-wide");
  const matched = screenshots.filter((path) => pageTypes.some((pageType) => screenshotMatchesPage(path, pageType))).slice(0, 4);

  return matched.length > 0 ? matched : screenshots.slice(0, 2);
}

export function visualFocusForOpportunity(opportunity: AuditOpportunity) {
  const text = normalizeText([opportunity.title, opportunity.description, opportunity.suggestedImplementation, ...opportunity.evidence].join(" "));

  if (/(footer|contentinfo|destek link|politika)/.test(text)) return "Footer / sayfanın en alt destek linkleri alanı";
  if (/(hero|vitrin|ana gorsel)/.test(text)) return "İlk viewport hero alanı";
  if (/(cta|aksiyon|sepete|checkout)/.test(text)) return "Ana aksiyon butonu ve karar alanı";
  if (/(mobile menu|mobil menu|hamburger)/.test(text)) return "Mobil header menü tetikleyicisi";
  if (/(wishlist|favorite|favori|heart|kalp)/.test(text)) return "Ürün kartı veya PDP favori aksiyonu";
  if (/(search|arama)/.test(text)) return "Header arama alanı";
  if (/(category|kategori)/.test(text)) return "Ana sayfa kategori kısayolları";
  if (/(h1|baslik|heading)/.test(text)) return "Sayfa başlığı / H1 alanı";
  if (/(contrast|kontrast|color)/.test(text)) return "Kontrast ihlali veren metin ve arka plan alanı";

  return "İlgili sayfa bölümü";
}

export function screenshotObjectPosition(opportunity: AuditOpportunity) {
  const text = normalizeText([opportunity.title, opportunity.description, opportunity.suggestedImplementation, ...opportunity.evidence].join(" "));

  if (/(footer|contentinfo|destek link|politika)/.test(text)) return "object-bottom";
  if (/(hero|h1|baslik|heading|mobile menu|mobil menu|search|arama)/.test(text)) return "object-top";

  return "object-center";
}

export function bestPracticesForOpportunity(opportunity: AuditOpportunity) {
  const text = normalizeText([opportunity.title, opportunity.description, opportunity.suggestedImplementation, ...opportunity.evidence].join(" "));

  if (/(footer|contentinfo|destek link|politika)/.test(text)) {
    return [
      "Footer destek linklerini contentinfo landmark içinde grupla.",
      "İletişim, yardım/SSS, kargo, iade, gizlilik/KVKK ve kullanım koşulları linklerini mobilde de erişilebilir tut.",
      "Footer linklerini sadece görsel ikonla değil, okunabilir link metniyle render et."
    ];
  }

  if (/(hero|vitrin|ana gorsel)/.test(text)) {
    return [
      "Hero alanında tek ana mesaj, tek birincil CTA ve ikincil aksiyonu açık hiyerarşiyle göster.",
      "Mobilde metin görselin altında veya okunabilir kontrastla görünmeli; CTA ilk viewport içinde kalmalı.",
      "Hero görseli kampanya veya kategori vaadini gerçekten göstermeli."
    ];
  }

  if (/(cta|aksiyon|sepete|checkout)/.test(text)) {
    return [
      "CTA metni müşterinin sonraki aksiyonunu açıkça anlatmalı.",
      "CTA çevresinde fiyat, teslimat, varyant veya güven bilgisi gibi karar destekleri bulunmalı.",
      "CTA tıklaması analitik event olarak izlenmeli."
    ];
  }

  if (/(wishlist|favorite|favori|heart|kalp)/.test(text)) {
    return [
      "Favori aksiyonunda erişilebilir ad, boş/dolu durum ve login gerekiyorsa anlaşılır yönlendirme olmalı.",
      "Ürün kartı ve PDP davranışı tutarlı olmalı.",
      "Favoriye ekleme/kaldırma eventleri ölçümlenmeli."
    ];
  }

  if (/(mobile menu|mobil menu|hamburger)/.test(text)) {
    return [
      "Mobil menü butonunda aria-label, aria-controls ve aria-expanded kullanılmalı.",
      "Menü açıldığında focus yönetimi ve klavye ile kapatma çalışmalı.",
      "Menüde kategori, arama, hesap ve destek yolları tek elle ulaşılabilir olmalı."
    ];
  }

  if (/(search|arama)/.test(text)) {
    return [
      "Arama alanı header içinde görünür veya tek dokunuşla açılır olmalı.",
      "Placeholder örnek arama niyetini anlatmalı.",
      "Arama submit, boş arama ve sonuçsuz durum davranışları net olmalı."
    ];
  }

  if (/(category|kategori)/.test(text)) {
    return [
      "Kategori kısayolları en yüksek ticari değere sahip 6-8 hedefle sınırlanmalı.",
      "Mobilde yatay kaydırma veya iki kolon düzeni taşma yapmadan çalışmalı.",
      "Her kısayolun link metni kategori niyetini açıkça anlatmalı."
    ];
  }

  if (/(h1|baslik|heading)/.test(text)) {
    return [
      "Sayfada tek, görünür ve anlamlı H1 olmalı.",
      "H1 marka sloganı yerine sayfanın ürün/kategori amacını anlatmalı.",
      "Heading hiyerarşisi H1-H2-H3 şeklinde tutarlı ilerlemeli."
    ];
  }

  if (/(contrast|kontrast|color)/.test(text)) {
    return [
      "Normal metin için en az 4.5:1, büyük metin için en az 3:1 kontrast hedeflenmeli.",
      "CTA hover/focus/disabled durumlarında da kontrast korunmalı.",
      "Renk tek başına durum anlatımı için kullanılmamalı."
    ];
  }

  if (opportunity.category === "accessibility") {
    return [
      "Düzeltme WCAG ve axe tekrar testiyle doğrulanmalı.",
      "Klavye erişimi ve ekran okuyucu adı bozulmamalı.",
      "Yeni bileşenlerde focus görünürlüğü korunmalı."
    ];
  }

  if (opportunity.category === "performance") {
    return [
      "Değişiklik Lighthouse metriklerinde sayısal iyileşmeyle doğrulanmalı.",
      "Görsel/script optimizasyonu kullanıcıya görünen içeriği geciktirmemeli.",
      "Mobil ağ koşullarında regresyon kontrolü yapılmalı."
    ];
  }

  return [
    "Değişiklik desktop ve mobilde ayrı ayrı doğrulanmalı.",
    "Task kapanmadan önce ilgili detector veya teknik audit tekrar çalıştırılmalı.",
    "Uygulama kapsamı ölçülebilir bir başarı metriğine bağlanmalı."
  ];
}

export function storageUrl(path: string) {
  if (path.startsWith("/") || path.startsWith("http://") || path.startsWith("https://")) return path;
  return `/storage/${path}`;
}

export function formatPageType(value: string) {
  const labels: Record<string, string> = {
    home: "Ana sayfa",
    plp: "Listeleme",
    pdp: "Ürün detay",
    search: "Arama",
    campaign: "Kampanya",
    content: "İçerik",
    unknown: "Bilinmeyen",
    "audit-wide": "Audit kapsamı"
  };

  return labels[value] ?? value.toUpperCase();
}

export function formatToken(value: string) {
  const labels: Record<string, string> = {
    fashion: "Moda",
    electronics: "Elektronik",
    grocery: "Market",
    beauty: "Kozmetik",
    home_living: "Ev & Yaşam",
    sports: "Spor",
    marketplace: "Pazaryeri",
    other: "Diğer",
    budget: "Ekonomik",
    mid: "Orta",
    premium: "Premium",
    luxury: "Lüks",
    unknown: "Bilinmeyen",
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
    post_purchase: "Satın alma sonrası",
    retention_stage: "Sadakat"
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

function opportunityClusterKey(opportunity: AuditOpportunity) {
  const pages = [...opportunity.affectedPages].sort().join("|") || "audit-wide";
  const text = normalizeText([opportunity.title, opportunity.description, opportunity.category, ...opportunity.evidence].join(" "));

  return `${pages}:${findingFeatureKey(text)}`;
}

function screenshotMatchesPage(path: string, pageType: string) {
  const normalized = path.toLowerCase();

  return normalized.includes(`/${pageType}-`) || normalized.includes(`${pageType}-desktop`) || normalized.includes(`${pageType}-mobile`);
}

function findingFeatureKey(text: string) {
  if (/(hero|vitrin|ana gorsel)/.test(text)) return "hero";
  if (/(h1|baslik|heading)/.test(text)) return "h1";
  if (/(meta description|meta aciklama)/.test(text)) return "meta-description";
  if (/(category|kategori)/.test(text)) return "category-shortcuts";
  if (/(mobile menu|mobil menu|hamburger)/.test(text)) return "mobile-menu";
  if (/(wishlist|favorite|favourite|favori|istek listesi|heart|kalp)/.test(text)) return "wishlist";
  if (/(color contrast|color-contrast|kontrast)/.test(text)) return "color-contrast";
  if (/(document title|document-title|title element)/.test(text)) return "document-title";
  if (/(landmark|main landmark)/.test(text)) return "landmark";
  if (/(server response|server-response-time|ttfb)/.test(text)) return "server-response-time";
  if (/(render-blocking|render engelleyici)/.test(text)) return "render-blocking";
  if (/(unused css|kullanilmayan css)/.test(text)) return "unused-css";

  return text.replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 8).join("-");
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
