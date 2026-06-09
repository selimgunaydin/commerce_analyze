import type { ExtractedPageData, PageType } from "./types";

export type DetectorResult = {
  key: string;
  label: string;
  passed: boolean;
  confidence: number;
  severity: "info" | "low" | "medium" | "high";
  evidence: string[];
};

type DetectorContext = {
  pageType: PageType;
  extracted: ExtractedPageData;
  text: string;
  buttonText: string;
  linkText: string;
  elementText: string;
  fieldText: string;
  priceCount: number;
};

const wishlistKeywords = [
  "wishlist",
  "wish list",
  "wish-list",
  "favorite",
  "favourite",
  "favori",
  "istek listesi",
  "istek-listesi",
  "add-to-wishlist",
  "add to wishlist",
  "heart",
  "kalp",
  "begeni",
  "beğeni"
];

const mobileMenuKeywords = [
  "mobile menu",
  "mobil menu",
  "mobil menü",
  "hamburger",
  "burger",
  "menu toggle",
  "menü",
  "menu",
  "navbar-toggler",
  "nav-toggler",
  "drawer",
  "offcanvas",
  "side menu",
  "yan menu",
  "yan menü"
];

const footerSupportKeywords = [
  "privacy",
  "gizlilik",
  "kvkk",
  "terms",
  "kosullar",
  "koşullar",
  "contact",
  "iletisim",
  "iletişim",
  "about",
  "hakkimizda",
  "hakkımızda",
  "yardim",
  "yardım",
  "musteri hizmetleri",
  "müşteri hizmetleri",
  "sss",
  "sikca sorulan",
  "sıkça sorulan",
  "iade",
  "kargo",
  "teslimat",
  "magazalar",
  "mağazalar"
];

export function runEcommerceDetectors(params: {
  pageType: PageType;
  extracted: ExtractedPageData;
}) {
  const context = createContext(params.pageType, params.extracted);
  const pageDetectors = getPageSpecificDetectors(context);
  const technicalDetectors = getTechnicalDetectors(context);

  return [...pageDetectors, ...technicalDetectors];
}

function getPageSpecificDetectors(context: DetectorContext) {
  if (context.pageType === "home") {
    return getHomepageDetectors(context);
  }

  if (context.pageType === "plp") {
    return getPlpDetectors(context);
  }

  if (context.pageType === "pdp") {
    return getPdpDetectors(context);
  }

  return [];
}

function getHomepageDetectors(context: DetectorContext): DetectorResult[] {
  const ctaEvidence = findButtonOrLinkEvidence(context, ["shop", "buy", "explore", "discover", "incele", "alisveris", "alışveriş"]);
  const categoryLinkCount = context.extracted.links.filter((link) =>
    hasAny(`${link.text} ${link.href}`, ["category", "kategori", "collection", "koleksiyon", "shop", "products", "urunler", "ürünler"])
  ).length;

  return [
    result({
      key: "homepage_has_hero",
      label: "Ana sayfada hero alanı ve aksiyon var",
      passed: context.extracted.headings.h1.length > 0 && ctaEvidence.length > 0,
      confidence: 0.65,
      severity: "medium",
      evidence: [...firstHeadingEvidence(context), ...ctaEvidence].slice(0, 3)
    }),
    result({
      key: "homepage_has_h1",
      label: "Ana sayfada H1 başlığı var",
      passed: context.extracted.headings.h1.length > 0,
      confidence: 0.95,
      severity: "medium",
      evidence: firstHeadingEvidence(context)
    }),
    result({
      key: "homepage_has_cta",
      label: "Ana sayfada ana aksiyon çağrısı var",
      passed: ctaEvidence.length > 0,
      confidence: 0.75,
      severity: "medium",
      evidence: ctaEvidence
    }),
    result({
      key: "homepage_has_promo_text",
      label: "Ana sayfada kampanya mesajı var",
      passed: hasAny(context.text, ["campaign", "kampanya", "discount", "indirim", "sale", "outlet", "free shipping", "ucretsiz kargo"]),
      confidence: 0.7,
      severity: "low",
      evidence: matchEvidence(context.text, ["campaign", "kampanya", "discount", "indirim", "sale", "outlet", "free shipping", "ucretsiz kargo"])
    }),
    result({
      key: "homepage_has_category_shortcuts",
      label: "Ana sayfada kategori kısayolları var",
      passed: categoryLinkCount >= 3,
      confidence: categoryLinkCount >= 3 ? 0.75 : 0.55,
      severity: "medium",
      evidence: [`Kategori benzeri link sayısı: ${categoryLinkCount}`]
    }),
    result({
      key: "homepage_has_search_input",
      label: "Ana sayfada arama alanı var",
      passed: hasSearchInput(context),
      confidence: 0.85,
      severity: "medium",
      evidence: formFieldEvidence(context, ["search", "arama"])
    }),
    result({
      key: "homepage_has_trust_badge",
      label: "Ana sayfada güven unsuru var",
      passed: hasAny(context.text, ["secure", "guvenli", "güvenli", "trusted", "free return", "iade", "ssl", "guarantee"]),
      confidence: 0.6,
      severity: "low",
      evidence: matchEvidence(context.text, ["secure", "guvenli", "trusted", "free return", "iade", "ssl", "guarantee"])
    }),
    booleanTextDetector(
      context,
      "homepage_has_loyalty_signal",
      "Ana sayfada sadakat, puan veya üyelik avantajı var",
      ["loyalty", "reward", "rewards", "points", "puan", "sadakat", "uyelik", "üyelik", "club", "kulup", "kulüp", "bonus", "cashback"],
      "medium"
    ),
    booleanTextDetector(
      context,
      "homepage_has_service_support_signal",
      "Ana sayfada müşteri destek veya canlı yardım sinyali var",
      ["whatsapp", "live chat", "canli destek", "canlı destek", "musteri hizmetleri", "müşteri hizmetleri", "yardim", "yardım", "destek"],
      "low"
    ),
    booleanTextDetector(
      context,
      "homepage_has_delivery_return_value",
      "Ana sayfada kargo veya iade avantajı görünür",
      ["free shipping", "ucretsiz kargo", "ücretsiz kargo", "same day", "ayni gun", "aynı gün", "return", "iade", "teslimat", "kargo"],
      "medium"
    ),
    booleanTextDetector(
      context,
      "homepage_has_social_proof",
      "Ana sayfada yorum, puan veya müşteri memnuniyeti sinyali var",
      ["review", "rating", "yorum", "degerlendirme", "değerlendirme", "memnuniyet", "star", "yildiz", "yıldız"],
      "low"
    ),
    result({
      key: "homepage_has_header_navigation",
      label: "Ana sayfada üst navigasyon var",
      passed: context.extracted.links.length >= 5,
      confidence: 0.55,
      severity: "low",
      evidence: [`Link sayısı: ${context.extracted.links.length}`]
    }),
    result({
      key: "homepage_has_mobile_menu_signal",
      label: "Ana sayfada mobil menü sinyali var",
      passed: hasMobileMenuSignal(context),
      confidence: hasMobileMenuSignal(context) ? 0.78 : 0.45,
      severity: "low",
      evidence: featureEvidence(context, mobileMenuKeywords)
    }),
    result({
      key: "homepage_has_footer_links",
      label: "Ana sayfada footer destek linkleri var",
      passed: hasFooterSupportLinks(context),
      confidence: 0.55,
      severity: "low",
      evidence: footerSupportEvidence(context)
    })
  ];
}

function getPlpDetectors(context: DetectorContext): DetectorResult[] {
  return [
    result({
      key: "plp_has_product_grid",
      label: "Listeleme sayfasında ürün grid yapısı var",
      passed: context.priceCount >= 4 || hasAny(context.text, ["product grid", "urun listesi", "ürün listesi"]),
      confidence: context.priceCount >= 4 ? 0.75 : 0.5,
      severity: "high",
      evidence: [`Fiyat benzeri metin sayısı: ${context.priceCount}`]
    }),
    result({
      key: "plp_has_product_card_signal",
      label: "Listeleme sayfasında ürün kartı sinyali var",
      passed: hasAny(context.text, ["product card", "urun kart", "ürün kart", "quick view", "hizli incele"]) || context.priceCount >= 3,
      confidence: 0.65,
      severity: "medium",
      evidence: matchEvidence(context.text, ["product card", "urun kart", "quick view", "hizli incele"])
    }),
    result({
      key: "plp_has_price_text",
      label: "Listeleme sayfasında fiyat bilgisi var",
      passed: context.priceCount > 0,
      confidence: 0.85,
      severity: "high",
      evidence: [`Fiyat benzeri metin sayısı: ${context.priceCount}`]
    }),
    booleanTextDetector(context, "plp_has_discount_badge", "Listeleme sayfasında indirim etiketi var", ["discount", "indirim", "sale", "%"], "medium"),
    booleanTextDetector(context, "plp_has_filter", "Listeleme sayfasında filtreleme var", ["filter", "filtre", "refine"], "medium"),
    booleanTextDetector(context, "plp_has_sort", "Listeleme sayfasında sıralama var", ["sort", "sirala", "sırala"], "medium"),
    booleanTextDetector(context, "plp_has_quick_add", "Listeleme sayfasında hızlı sepete ekleme sinyali var", ["quick add", "quick cart", "hizli sepet", "hızlı sepet", "sepete ekle"], "medium"),
    booleanFeatureDetector(context, "plp_has_wishlist", "Listeleme sayfasında favori/istek listesi sinyali var", wishlistKeywords, "low"),
    booleanTextDetector(context, "plp_has_rating_review", "Listeleme sayfasında yorum veya puan sinyali var", ["rating", "review", "yorum", "star", "yildiz", "yıldız"], "low"),
    booleanTextDetector(context, "plp_has_variant_signal", "Listeleme sayfasında renk/beden varyant sinyali var", ["color", "renk", "size", "beden", "variant"], "low"),
    booleanTextDetector(context, "plp_has_pagination", "Listeleme sayfasında sayfalama veya daha fazla yükleme var", ["pagination", "next", "previous", "load more", "daha fazla"], "low"),
    booleanTextDetector(context, "plp_has_breadcrumb", "Listeleme sayfasında breadcrumb var", ["breadcrumb", "home /", "anasayfa"], "low"),
    result({
      key: "plp_has_empty_state",
      label: "Listeleme sayfasında boş sonuç durumu sinyali var",
      passed: hasAny(context.text, ["no products", "no results", "sonuc bulunamadi", "sonuç bulunamadı", "urun bulunamadi"]),
      confidence: 0.6,
      severity: "info",
      evidence: matchEvidence(context.text, ["no products", "no results", "sonuc bulunamadi", "urun bulunamadi"])
    })
  ];
}

function getPdpDetectors(context: DetectorContext): DetectorResult[] {
  return [
    result({
      key: "pdp_has_product_title",
      label: "Ürün detay sayfasında ürün başlığı var",
      passed: context.extracted.headings.h1.length > 0,
      confidence: 0.9,
      severity: "high",
      evidence: firstHeadingEvidence(context)
    }),
    result({
      key: "pdp_has_price",
      label: "Ürün detay sayfasında fiyat var",
      passed: context.priceCount > 0,
      confidence: 0.85,
      severity: "high",
      evidence: [`Fiyat benzeri metin sayısı: ${context.priceCount}`]
    }),
    result({
      key: "pdp_has_discount_price",
      label: "Ürün detay sayfasında indirimli fiyat sinyali var",
      passed: context.priceCount >= 2 || hasAny(context.text, ["discount", "indirim", "sale", "%"]),
      confidence: 0.65,
      severity: "low",
      evidence: [`Fiyat benzeri metin sayısı: ${context.priceCount}`, ...matchEvidence(context.text, ["discount", "indirim", "sale"])]
    }),
    result({
      key: "pdp_has_add_to_cart",
      label: "Ürün detay sayfasında sepete ekleme var",
      passed: hasAny(`${context.buttonText} ${context.text}`, ["add to cart", "sepete ekle", "sepet", "buy now", "satın al", "satin al"]),
      confidence: 0.9,
      severity: "high",
      evidence: findButtonOrLinkEvidence(context, ["add to cart", "sepete ekle", "buy now", "satın al", "satin al"])
    }),
    booleanTextDetector(context, "pdp_has_variant_selector", "Ürün detay sayfasında varyant seçimi var", ["variant", "color", "renk", "size", "beden", "numara"], "medium"),
    booleanTextDetector(context, "pdp_has_size_guide", "Ürün detay sayfasında beden/ölçü rehberi var", ["size guide", "beden tablosu", "olcu tablosu", "ölçü tablosu"], "medium"),
    booleanTextDetector(context, "pdp_has_stock_info", "Ürün detay sayfasında stok bilgisi var", ["stock", "stok", "in stock", "out of stock", "tukendi", "tükendi"], "medium"),
    booleanTextDetector(context, "pdp_has_shipping_return_info", "Ürün detay sayfasında kargo/iade bilgisi var", ["shipping", "delivery", "return", "teslimat", "kargo", "iade"], "medium"),
    booleanTextDetector(context, "pdp_has_delivery_eta", "Ürün detay sayfasında teslimat zamanı veya kargo beklentisi var", ["delivery date", "estimated delivery", "teslimat tarihi", "tahmini teslimat", "yarin kargoda", "yarın kargoda", "bugun kargoda", "bugün kargoda"], "medium"),
    booleanTextDetector(context, "pdp_has_payment_installment", "Ürün detay sayfasında ödeme veya taksit bilgisi var", ["installment", "taksit", "payment", "odeme", "ödeme", "credit card", "kredi karti", "kredi kartı"], "low"),
    booleanTextDetector(context, "pdp_has_loyalty_value", "Ürün detay sayfasında sadakat veya puan kazanımı var", ["loyalty", "reward", "points", "puan", "sadakat", "uyelik", "üyelik", "club", "kulup", "kulüp", "bonus", "cashback"], "medium"),
    booleanTextDetector(context, "pdp_has_description", "Ürün detay sayfasında ürün açıklaması var", ["description", "aciklama", "açıklama", "details", "detay"], "medium"),
    result({
      key: "pdp_has_image_gallery",
      label: "Ürün detay sayfasında görsel galerisi var",
      passed: context.extracted.images.length >= 3 || hasAny(context.text, ["gallery", "galeri"]),
      confidence: context.extracted.images.length >= 3 ? 0.75 : 0.45,
      severity: "medium",
      evidence: [`Görsel sayısı: ${context.extracted.images.length}`]
    }),
    booleanTextDetector(context, "pdp_has_review_rating", "Ürün detay sayfasında yorum veya puan var", ["rating", "review", "yorum", "star", "yildiz", "yıldız"], "low"),
    booleanFeatureDetector(context, "pdp_has_wishlist", "Ürün detay sayfasında favori veya istek listesi sinyali var", wishlistKeywords, "low"),
    booleanTextDetector(context, "pdp_has_related_products", "Ürün detay sayfasında benzer ürünler var", ["related products", "benzer urunler", "benzer ürünler", "you may also like"], "low"),
    booleanTextDetector(context, "pdp_has_sticky_add_to_cart", "Ürün detay sayfasında sabit sepete ekle sinyali var", ["sticky add to cart", "sticky cart", "sabit sepet"], "medium")
  ];
}

function getTechnicalDetectors(context: DetectorContext): DetectorResult[] {
  const h1Count = context.extracted.headings.h1.length;
  const imagesWithoutAlt = context.extracted.images.filter((image) => !image.alt?.trim());
  const buttonsWithoutName = context.extracted.buttons.filter((button) => !`${button.text ?? ""}${button.ariaLabel ?? ""}`.trim());
  const linksWithoutText = context.extracted.links.filter((link) => !link.text.trim());
  const externalScriptCount = context.extracted.scripts.filter((script) => script.isExternal).length;
  const unlabeledFields = context.extracted.forms.flatMap((form) =>
    form.fields.filter((field) => {
      const type = normalize(`${field.type ?? ""}`);
      return !["hidden", "submit", "button"].includes(type) && !`${field.label ?? ""}${field.placeholder ?? ""}`.trim();
    })
  );

  return [
    result({
      key: "technical_has_h1",
      label: "Sayfada H1 başlığı var",
      passed: h1Count > 0,
      confidence: 0.95,
      severity: "high",
      evidence: firstHeadingEvidence(context)
    }),
    result({
      key: "technical_single_h1",
      label: "Sayfada en fazla bir H1 var",
      passed: h1Count <= 1,
      confidence: 0.95,
      severity: "medium",
      evidence: [`H1 sayısı: ${h1Count}`]
    }),
    result({
      key: "technical_has_meta_description",
      label: "Sayfada meta açıklama var",
      passed: Boolean(context.extracted.metaDescription?.trim()),
      confidence: 0.95,
      severity: "medium",
      evidence: context.extracted.metaDescription ? [truncateEvidence(context.extracted.metaDescription)] : []
    }),
    result({
      key: "technical_images_have_alt",
      label: "Görsellerde alt metin var",
      passed: imagesWithoutAlt.length === 0,
      confidence: context.extracted.images.length > 0 ? 0.85 : 0.45,
      severity: "medium",
      evidence: [`Alt metni olmayan görsel sayısı: ${imagesWithoutAlt.length}`, ...imagesWithoutAlt.slice(0, 2).map((image) => truncateEvidence(image.src))]
    }),
    result({
      key: "technical_buttons_have_accessible_name",
      label: "Butonların erişilebilir adı var",
      passed: buttonsWithoutName.length === 0,
      confidence: 0.85,
      severity: "medium",
      evidence: [`Erişilebilir adı olmayan buton sayısı: ${buttonsWithoutName.length}`]
    }),
    result({
      key: "technical_links_have_text",
      label: "Linklerde anlaşılır metin var",
      passed: linksWithoutText.length === 0,
      confidence: 0.8,
      severity: "medium",
      evidence: [`Metinsiz link sayısı: ${linksWithoutText.length}`]
    }),
    result({
      key: "technical_no_console_errors",
      label: "Konsolda kritik hata yok",
      passed: context.extracted.consoleErrors.length === 0,
      confidence: 0.9,
      severity: "high",
      evidence: context.extracted.consoleErrors.slice(0, 3).map(truncateEvidence)
    }),
    result({
      key: "technical_no_failed_requests",
      label: "Kritik ağ isteği hatası yok",
      passed: context.extracted.failedRequests.length === 0,
      confidence: 0.9,
      severity: "high",
      evidence: context.extracted.failedRequests.slice(0, 3).map((request) => truncateEvidence(`${request.status ?? ""} ${request.url}`.trim()))
    }),
    result({
      key: "technical_dom_text_not_excessive",
      label: "Sayfa metin hacmi aşırı değil",
      passed: context.extracted.visibleText.length < 18_000,
      confidence: 0.7,
      severity: "low",
      evidence: [`Görünen metin uzunluğu: ${context.extracted.visibleText.length}`]
    }),
    result({
      key: "technical_external_script_count_reasonable",
      label: "Harici script sayısı makul",
      passed: externalScriptCount <= 15,
      confidence: 0.55,
      severity: "low",
      evidence: [`Harici script sayısı: ${externalScriptCount}`]
    }),
    result({
      key: "technical_form_fields_have_labels",
      label: "Form alanlarında label veya placeholder var",
      passed: unlabeledFields.length === 0,
      confidence: 0.75,
      severity: "medium",
      evidence: [`Etiketsiz form alanı sayısı: ${unlabeledFields.length}`]
    })
  ];
}

function createContext(pageType: PageType, extracted: ExtractedPageData): DetectorContext {
  const buttonText = extracted.buttons.map((button) => `${button.text} ${button.ariaLabel ?? ""}`).join(" ");
  const linkText = extracted.links.map((link) => `${link.text} ${link.href}`).join(" ");
  const elementText = (extracted.elements ?? []).map(elementSignalText).join(" ");
  const fieldText = extracted.forms
    .flatMap((form) => form.fields.map((field) => `${field.name ?? ""} ${field.type ?? ""} ${field.placeholder ?? ""} ${field.label ?? ""}`))
    .join(" ");
  const text = normalize(
    [
      extracted.title ?? "",
      extracted.metaDescription ?? "",
      extracted.visibleText,
      extracted.headings.h1.join(" "),
      extracted.headings.h2.join(" "),
      buttonText,
      linkText,
      elementText,
      fieldText
    ].join(" ")
  );

  return {
    pageType,
    extracted,
    text,
    buttonText: normalize(buttonText),
    linkText: normalize(linkText),
    elementText: normalize(elementText),
    fieldText: normalize(fieldText),
    priceCount: countMatches(text, /(?:[$€£₺]\s?\d|\d+(?:[.,]\d{2})?\s?(?:tl|try|usd|eur))/gi)
  };
}

function booleanTextDetector(
  context: DetectorContext,
  key: string,
  label: string,
  keywords: string[],
  severity: DetectorResult["severity"]
) {
  return result({
    key,
    label,
    passed: hasAny(context.text, keywords),
    confidence: 0.7,
    severity,
    evidence: matchEvidence(context.text, keywords)
  });
}

function booleanFeatureDetector(
  context: DetectorContext,
  key: string,
  label: string,
  keywords: string[],
  severity: DetectorResult["severity"]
) {
  const evidence = featureEvidence(context, keywords);

  return result({
    key,
    label,
    passed: evidence.length > 0 || hasAny(context.text, keywords),
    confidence: evidence.length > 0 ? 0.82 : 0.62,
    severity,
    evidence: evidence.length > 0 ? evidence : matchEvidence(context.text, keywords)
  });
}

function result(params: DetectorResult): DetectorResult {
  return {
    ...params,
    confidence: Number(params.confidence.toFixed(2)),
    evidence: params.evidence.filter(Boolean).slice(0, 5)
  };
}

function firstHeadingEvidence(context: DetectorContext) {
  return context.extracted.headings.h1.slice(0, 2).map((heading) => `H1: ${truncateEvidence(heading)}`);
}

function findButtonOrLinkEvidence(context: DetectorContext, keywords: string[]) {
  return [
    ...context.extracted.buttons
      .filter((button) => hasAny(`${button.text} ${button.ariaLabel ?? ""}`, keywords))
      .map((button) => `Buton: ${truncateEvidence(button.text || button.ariaLabel || "")}`),
    ...findLinkEvidence(context, keywords)
  ].slice(0, 4);
}

function featureEvidence(context: DetectorContext, keywords: string[]) {
  return [
    ...findButtonOrLinkEvidence(context, keywords),
    ...(context.extracted.elements ?? [])
      .filter((element) => hasAny(elementSignalText(element), keywords))
      .map((element) => `Öğe: ${truncateEvidence(elementSignalText(element))}`)
  ].slice(0, 5);
}

function hasMobileMenuSignal(context: DetectorContext) {
  return (
    featureEvidence(context, mobileMenuKeywords).length > 0 ||
    hasAny(context.elementText, ["aria-expanded", "aria-controls", "navbar-toggler", "offcanvas", "drawer"])
  );
}

function findLinkEvidence(context: DetectorContext, keywords: string[]) {
  return context.extracted.links
    .filter((link) => hasAny(`${link.text} ${link.href}`, keywords))
    .map((link) => `Link: ${truncateEvidence(link.text || link.href)}`)
    .slice(0, 4);
}

function formFieldEvidence(context: DetectorContext, keywords: string[]) {
  return context.extracted.forms
    .flatMap((form) => form.fields)
    .filter((field) => hasAny(`${field.name ?? ""} ${field.type ?? ""} ${field.placeholder ?? ""} ${field.label ?? ""}`, keywords))
    .map((field) => `Alan: ${truncateEvidence(field.placeholder || field.label || field.name || field.type || "")}`)
    .slice(0, 4);
}

function footerSupportEvidence(context: DetectorContext) {
  const footerLandmarks = (context.extracted.landmarks ?? []).filter((landmark) => landmark.area === "footer");
  const footerLinks = footerLandmarks.flatMap((landmark) => landmark.links);
  const matchedFooterLinks = footerLinks
    .filter((link) => hasAny(`${link.text} ${link.href}`, footerSupportKeywords))
    .map((link) => `Footer link: ${truncateEvidence(link.text || link.href)}`);
  const matchedFooterText = footerLandmarks.flatMap((landmark) => matchEvidence(normalize(landmark.text), footerSupportKeywords));
  const fallbackLinks = findLinkEvidence(context, footerSupportKeywords).map((item) => item.replace(/^Link:/, "Destek linki:"));

  return [
    ...matchedFooterLinks,
    ...matchedFooterText,
    footerLinks.length > 0 ? `Footer link sayısı: ${footerLinks.length}` : "",
    ...fallbackLinks
  ].filter(Boolean).slice(0, 5);
}

function hasFooterSupportLinks(context: DetectorContext) {
  const evidence = footerSupportEvidence(context);

  return evidence.some((item) => !item.startsWith("Footer link sayısı")) || hasAny(context.linkText, footerSupportKeywords);
}

function matchEvidence(text: string, keywords: string[]) {
  return keywords.filter((keyword) => text.includes(normalize(keyword))).slice(0, 4).map((keyword) => `Eşleşen ifade: ${keyword}`);
}

function hasSearchInput(context: DetectorContext) {
  return hasAny(context.fieldText, ["search", "arama"]);
}

function hasAny(text: string, keywords: string[]) {
  const normalizedText = normalize(text);
  return keywords.some((keyword) => normalizedText.includes(normalize(keyword)));
}

function elementSignalText(element: NonNullable<ExtractedPageData["elements"]>[number]) {
  return [
    element.tag,
    element.text,
    element.ariaLabel,
    element.ariaControls ? `aria-controls ${element.ariaControls}` : undefined,
    element.ariaExpanded ? `aria-expanded ${element.ariaExpanded}` : undefined,
    element.title,
    element.role,
    element.id,
    element.className,
    element.href,
    element.type,
    element.name,
    element.dataTestId,
    element.dataAction,
    element.dataToggle,
    element.dataTarget
  ]
    .filter(Boolean)
    .join(" ");
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

function countMatches(text: string, pattern: RegExp) {
  return Array.from(text.matchAll(pattern)).length;
}

function truncateEvidence(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 140);
}
