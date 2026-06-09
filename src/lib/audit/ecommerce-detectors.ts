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
  fieldText: string;
  priceCount: number;
};

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
      label: "Homepage has hero signal",
      passed: context.extracted.headings.h1.length > 0 && ctaEvidence.length > 0,
      confidence: 0.65,
      severity: "medium",
      evidence: [...firstHeadingEvidence(context), ...ctaEvidence].slice(0, 3)
    }),
    result({
      key: "homepage_has_h1",
      label: "Homepage has H1",
      passed: context.extracted.headings.h1.length > 0,
      confidence: 0.95,
      severity: "medium",
      evidence: firstHeadingEvidence(context)
    }),
    result({
      key: "homepage_has_cta",
      label: "Homepage has CTA",
      passed: ctaEvidence.length > 0,
      confidence: 0.75,
      severity: "medium",
      evidence: ctaEvidence
    }),
    result({
      key: "homepage_has_promo_text",
      label: "Homepage has promo text",
      passed: hasAny(context.text, ["campaign", "kampanya", "discount", "indirim", "sale", "outlet", "free shipping", "ucretsiz kargo"]),
      confidence: 0.7,
      severity: "low",
      evidence: matchEvidence(context.text, ["campaign", "kampanya", "discount", "indirim", "sale", "outlet", "free shipping", "ucretsiz kargo"])
    }),
    result({
      key: "homepage_has_category_shortcuts",
      label: "Homepage has category shortcuts",
      passed: categoryLinkCount >= 3,
      confidence: categoryLinkCount >= 3 ? 0.75 : 0.55,
      severity: "medium",
      evidence: [`Category-like links: ${categoryLinkCount}`]
    }),
    result({
      key: "homepage_has_search_input",
      label: "Homepage has search input",
      passed: hasSearchInput(context),
      confidence: 0.85,
      severity: "medium",
      evidence: formFieldEvidence(context, ["search", "arama"])
    }),
    result({
      key: "homepage_has_trust_badge",
      label: "Homepage has trust badge",
      passed: hasAny(context.text, ["secure", "guvenli", "güvenli", "trusted", "free return", "iade", "ssl", "guarantee"]),
      confidence: 0.6,
      severity: "low",
      evidence: matchEvidence(context.text, ["secure", "guvenli", "trusted", "free return", "iade", "ssl", "guarantee"])
    }),
    result({
      key: "homepage_has_header_navigation",
      label: "Homepage has header navigation",
      passed: context.extracted.links.length >= 5,
      confidence: 0.55,
      severity: "low",
      evidence: [`Links: ${context.extracted.links.length}`]
    }),
    result({
      key: "homepage_has_mobile_menu_signal",
      label: "Homepage has mobile menu signal",
      passed: hasAny(`${context.buttonText} ${context.linkText}`, ["menu", "hamburger", "navigation", "nav"]),
      confidence: 0.45,
      severity: "low",
      evidence: findButtonOrLinkEvidence(context, ["menu", "hamburger", "navigation", "nav"])
    }),
    result({
      key: "homepage_has_footer_links",
      label: "Homepage has footer links",
      passed: hasAny(context.linkText, ["privacy", "terms", "contact", "about", "gizlilik", "iletisim", "iletişim", "yardim", "yardım"]),
      confidence: 0.55,
      severity: "low",
      evidence: findLinkEvidence(context, ["privacy", "terms", "contact", "about", "gizlilik", "iletisim", "yardim"])
    })
  ];
}

function getPlpDetectors(context: DetectorContext): DetectorResult[] {
  return [
    result({
      key: "plp_has_product_grid",
      label: "PLP has product grid",
      passed: context.priceCount >= 4 || hasAny(context.text, ["product grid", "urun listesi", "ürün listesi"]),
      confidence: context.priceCount >= 4 ? 0.75 : 0.5,
      severity: "high",
      evidence: [`Price-like texts: ${context.priceCount}`]
    }),
    result({
      key: "plp_has_product_card_signal",
      label: "PLP has product card signal",
      passed: hasAny(context.text, ["product card", "urun kart", "ürün kart", "quick view", "hizli incele"]) || context.priceCount >= 3,
      confidence: 0.65,
      severity: "medium",
      evidence: matchEvidence(context.text, ["product card", "urun kart", "quick view", "hizli incele"])
    }),
    result({
      key: "plp_has_price_text",
      label: "PLP has price text",
      passed: context.priceCount > 0,
      confidence: 0.85,
      severity: "high",
      evidence: [`Price-like texts: ${context.priceCount}`]
    }),
    booleanTextDetector(context, "plp_has_discount_badge", "PLP has discount badge", ["discount", "indirim", "sale", "%"], "medium"),
    booleanTextDetector(context, "plp_has_filter", "PLP has filter", ["filter", "filtre", "refine"], "medium"),
    booleanTextDetector(context, "plp_has_sort", "PLP has sort", ["sort", "sirala", "sırala"], "medium"),
    booleanTextDetector(context, "plp_has_rating_review", "PLP has rating or review", ["rating", "review", "yorum", "star", "yildiz", "yıldız"], "low"),
    booleanTextDetector(context, "plp_has_variant_signal", "PLP has color or size variant signal", ["color", "renk", "size", "beden", "variant"], "low"),
    booleanTextDetector(context, "plp_has_pagination", "PLP has pagination or infinite scroll signal", ["pagination", "next", "previous", "load more", "daha fazla"], "low"),
    booleanTextDetector(context, "plp_has_breadcrumb", "PLP has breadcrumb", ["breadcrumb", "home /", "anasayfa"], "low"),
    result({
      key: "plp_has_empty_state",
      label: "PLP has empty state signal",
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
      label: "PDP has product title",
      passed: context.extracted.headings.h1.length > 0,
      confidence: 0.9,
      severity: "high",
      evidence: firstHeadingEvidence(context)
    }),
    result({
      key: "pdp_has_price",
      label: "PDP has price",
      passed: context.priceCount > 0,
      confidence: 0.85,
      severity: "high",
      evidence: [`Price-like texts: ${context.priceCount}`]
    }),
    result({
      key: "pdp_has_discount_price",
      label: "PDP has discount price",
      passed: context.priceCount >= 2 || hasAny(context.text, ["discount", "indirim", "sale", "%"]),
      confidence: 0.65,
      severity: "low",
      evidence: [`Price-like texts: ${context.priceCount}`, ...matchEvidence(context.text, ["discount", "indirim", "sale"])]
    }),
    result({
      key: "pdp_has_add_to_cart",
      label: "PDP has add to cart",
      passed: hasAny(`${context.buttonText} ${context.text}`, ["add to cart", "sepete ekle", "sepet", "buy now", "satın al", "satin al"]),
      confidence: 0.9,
      severity: "high",
      evidence: findButtonOrLinkEvidence(context, ["add to cart", "sepete ekle", "buy now", "satın al", "satin al"])
    }),
    booleanTextDetector(context, "pdp_has_variant_selector", "PDP has variant selector", ["variant", "color", "renk", "size", "beden", "numara"], "medium"),
    booleanTextDetector(context, "pdp_has_size_guide", "PDP has size guide", ["size guide", "beden tablosu", "olcu tablosu", "ölçü tablosu"], "medium"),
    booleanTextDetector(context, "pdp_has_stock_info", "PDP has stock info", ["stock", "stok", "in stock", "out of stock", "tukendi", "tükendi"], "medium"),
    booleanTextDetector(context, "pdp_has_shipping_return_info", "PDP has shipping or return info", ["shipping", "delivery", "return", "teslimat", "kargo", "iade"], "medium"),
    booleanTextDetector(context, "pdp_has_description", "PDP has product description", ["description", "aciklama", "açıklama", "details", "detay"], "medium"),
    result({
      key: "pdp_has_image_gallery",
      label: "PDP has image gallery",
      passed: context.extracted.images.length >= 3 || hasAny(context.text, ["gallery", "galeri"]),
      confidence: context.extracted.images.length >= 3 ? 0.75 : 0.45,
      severity: "medium",
      evidence: [`Images: ${context.extracted.images.length}`]
    }),
    booleanTextDetector(context, "pdp_has_review_rating", "PDP has review or rating", ["rating", "review", "yorum", "star", "yildiz", "yıldız"], "low"),
    booleanTextDetector(context, "pdp_has_related_products", "PDP has related products", ["related products", "benzer urunler", "benzer ürünler", "you may also like"], "low"),
    booleanTextDetector(context, "pdp_has_sticky_add_to_cart", "PDP has sticky add to cart signal", ["sticky add to cart", "sticky cart", "sabit sepet"], "medium")
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
      label: "Page has H1",
      passed: h1Count > 0,
      confidence: 0.95,
      severity: "high",
      evidence: firstHeadingEvidence(context)
    }),
    result({
      key: "technical_single_h1",
      label: "Page has at most one H1",
      passed: h1Count <= 1,
      confidence: 0.95,
      severity: "medium",
      evidence: [`H1 count: ${h1Count}`]
    }),
    result({
      key: "technical_has_meta_description",
      label: "Page has meta description",
      passed: Boolean(context.extracted.metaDescription?.trim()),
      confidence: 0.95,
      severity: "medium",
      evidence: context.extracted.metaDescription ? [truncateEvidence(context.extracted.metaDescription)] : []
    }),
    result({
      key: "technical_images_have_alt",
      label: "Images have alt text",
      passed: imagesWithoutAlt.length === 0,
      confidence: context.extracted.images.length > 0 ? 0.85 : 0.45,
      severity: "medium",
      evidence: [`Images without alt: ${imagesWithoutAlt.length}`, ...imagesWithoutAlt.slice(0, 2).map((image) => truncateEvidence(image.src))]
    }),
    result({
      key: "technical_buttons_have_accessible_name",
      label: "Buttons have accessible names",
      passed: buttonsWithoutName.length === 0,
      confidence: 0.85,
      severity: "medium",
      evidence: [`Buttons without name: ${buttonsWithoutName.length}`]
    }),
    result({
      key: "technical_links_have_text",
      label: "Links have text",
      passed: linksWithoutText.length === 0,
      confidence: 0.8,
      severity: "medium",
      evidence: [`Links without text: ${linksWithoutText.length}`]
    }),
    result({
      key: "technical_no_console_errors",
      label: "No console errors",
      passed: context.extracted.consoleErrors.length === 0,
      confidence: 0.9,
      severity: "high",
      evidence: context.extracted.consoleErrors.slice(0, 3).map(truncateEvidence)
    }),
    result({
      key: "technical_no_failed_requests",
      label: "No failed network requests",
      passed: context.extracted.failedRequests.length === 0,
      confidence: 0.9,
      severity: "high",
      evidence: context.extracted.failedRequests.slice(0, 3).map((request) => truncateEvidence(`${request.status ?? ""} ${request.url}`.trim()))
    }),
    result({
      key: "technical_dom_text_not_excessive",
      label: "DOM text size is not excessive",
      passed: context.extracted.visibleText.length < 18_000,
      confidence: 0.7,
      severity: "low",
      evidence: [`Visible text length: ${context.extracted.visibleText.length}`]
    }),
    result({
      key: "technical_external_script_count_reasonable",
      label: "External script count is reasonable",
      passed: externalScriptCount <= 15,
      confidence: 0.55,
      severity: "low",
      evidence: [`External scripts: ${externalScriptCount}`]
    }),
    result({
      key: "technical_form_fields_have_labels",
      label: "Form fields have labels or placeholders",
      passed: unlabeledFields.length === 0,
      confidence: 0.75,
      severity: "medium",
      evidence: [`Unlabeled fields: ${unlabeledFields.length}`]
    })
  ];
}

function createContext(pageType: PageType, extracted: ExtractedPageData): DetectorContext {
  const buttonText = extracted.buttons.map((button) => `${button.text} ${button.ariaLabel ?? ""}`).join(" ");
  const linkText = extracted.links.map((link) => `${link.text} ${link.href}`).join(" ");
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
      fieldText
    ].join(" ")
  );

  return {
    pageType,
    extracted,
    text,
    buttonText: normalize(buttonText),
    linkText: normalize(linkText),
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
      .map((button) => `Button: ${truncateEvidence(button.text || button.ariaLabel || "")}`),
    ...findLinkEvidence(context, keywords)
  ].slice(0, 4);
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
    .map((field) => `Field: ${truncateEvidence(field.placeholder || field.label || field.name || field.type || "")}`)
    .slice(0, 4);
}

function matchEvidence(text: string, keywords: string[]) {
  return keywords.filter((keyword) => text.includes(normalize(keyword))).slice(0, 4).map((keyword) => `Matched: ${keyword}`);
}

function hasSearchInput(context: DetectorContext) {
  return hasAny(context.fieldText, ["search", "arama"]);
}

function hasAny(text: string, keywords: string[]) {
  const normalizedText = normalize(text);
  return keywords.some((keyword) => normalizedText.includes(normalize(keyword)));
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
