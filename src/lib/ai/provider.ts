import { getEnv } from "@/src/lib/config/env";
import { buildRepairPrompt, parseJSONFromModelOutput } from "./json-repair";
import { schemaByName, type SchemaName } from "./schemas";

export interface AIProvider {
  generateJSON<T>(params: {
    system: string;
    prompt: string;
    schemaName: SchemaName;
    maxRetries?: number;
  }): Promise<T>;
}

type ChatCompletionResponse = {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
};

export class OpenAICompatibleProvider implements AIProvider {
  async generateJSON<T>(params: {
    system: string;
    prompt: string;
    schemaName: SchemaName;
    maxRetries?: number;
  }): Promise<T> {
    const env = getEnv();

    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    const maxRetries = params.maxRetries ?? 2;
    let prompt = params.prompt;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const output = await this.generateText({
        system: params.system,
        prompt
      });

      try {
        const parsed = parseJSONFromModelOutput(output);
        return schemaByName[params.schemaName].parse(parsed) as T;
      } catch (error) {
        lastError = error;
        prompt = buildRepairPrompt({
          schemaName: params.schemaName,
          invalidOutput: output,
          validationError: error instanceof Error ? error.message : String(error)
        });
      }
    }

    throw lastError instanceof Error ? lastError : new Error("AI output validation failed.");
  }

  private async generateText(params: { system: string; prompt: string }) {
    const env = getEnv();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);

    try {
      const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL,
          response_format: {
            type: "json_object"
          },
          messages: [
            {
              role: "system",
              content: params.system
            },
            {
              role: "user",
              content: params.prompt
            }
          ]
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`AI provider failed with ${response.status}: ${await response.text()}`);
      }

      const json = (await response.json()) as ChatCompletionResponse;
      const content = json.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("AI provider returned an empty response.");
      }

      return content;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class LocalStructuredFallbackProvider implements AIProvider {
  async generateJSON<T>(params: {
    schemaName: SchemaName;
    prompt: string;
  }): Promise<T> {
    if (params.schemaName === "SiteProfile") {
      const input = extractInputJSON(params.prompt) as Record<string, unknown>;
      const homepage = input.homepage as Record<string, unknown> | undefined;
      const title = typeof homepage?.title === "string" ? homepage.title : "";
      const brandNameInput = typeof input.brandNameInput === "string" && input.brandNameInput ? input.brandNameInput : null;
      const industryInput = typeof input.industryInput === "string" && input.industryInput ? input.industryInput : "Bilinmeyen e-ticaret";

      return schemaByName.SiteProfile.parse({
        brandName: brandNameInput ?? inferBrandName(title),
        likelyIndustry: industryInput,
        ecommerceType: inferEcommerceType(`${title} ${homepage?.visibleText ?? ""}`),
        targetAudience: "Genel e-ticaret müşterileri",
        pricePositioning: "unknown",
        mainProductCategories: Array.isArray(homepage?.detectedCategories) ? homepage.detectedCategories.slice(0, 8) : [],
        businessModel: "unknown",
        confidence: 0.2,
        reasoning: ["AI sağlayıcısı doğrulanmış JSON üretemediği için yerel yapılandırılmış fallback kullanıldı."]
      }) as T;
    }

    if (params.schemaName === "CompetitorComparison") {
      const input = extractInputJSON(params.prompt) as Record<string, unknown>;
      const customer = input.customerHomepage as Record<string, unknown> | undefined;
      const competitors = Array.isArray(input.competitors) ? input.competitors : [];
      const customerDetectors = Array.isArray(customer?.detectorResults) ? customer.detectorResults : [];
      const customerFailed = detectorLabels(customerDetectors, false);
      const competitorPassed = competitors.flatMap((competitor) => {
        if (!competitor || typeof competitor !== "object") {
          return [];
        }

        const page = (competitor as Record<string, unknown>).homepage as Record<string, unknown> | undefined;
        return detectorLabels(Array.isArray(page?.detectorResults) ? page.detectorResults : [], true);
      });
      const gaps = customerFailed
        .filter((label) => competitorPassed.includes(label))
        .slice(0, 8)
        .map((label) => ({
          area: label,
          customerCurrentState: `Müşteri sitesinde bu kontrol geçmedi: ${label}`,
          competitorObservation: `En az bir rakipte bu kontrol geçti: ${label}`,
          recommendation: `Rakip kanıtını inceleyip müşteri deneyimine uyduğu yerde "${label}" alanını güçlendirin.`,
          impact: "medium" as const,
          evidence: [`Müşteri kontrolü: ${label}=false`, `Rakip kontrolü: ${label}=true`]
        }));

      return schemaByName.CompetitorComparison.parse({
        summary: "AI sağlayıcısı doğrulanmış çıktı üretemediği için yerel yapılandırılmış rakip karşılaştırması oluşturuldu.",
        customerAdvantages: detectorLabels(customerDetectors, true).slice(0, 8),
        competitorAdvantages: Array.from(new Set(competitorPassed)).slice(0, 8),
        gaps
      }) as T;
    }

    if (params.schemaName === "OpportunityGeneration") {
      const input = extractInputJSON(params.prompt) as Record<string, unknown>;

      return schemaByName.OpportunityGeneration.parse({
        opportunities: buildFallbackOpportunities(input)
      }) as T;
    }

    if (params.schemaName === "FinalAuditReport") {
      const input = extractInputJSON(params.prompt) as Record<string, unknown>;
      return schemaByName.FinalAuditReport.parse(input.finalReportDraft) as T;
    }

    const input = extractInputJSON(params.prompt) as Record<string, unknown>;
    const pageType = typeof input.pageType === "string" ? input.pageType : "unknown";
    const detectorResults = Array.isArray(input.detectorResults) ? input.detectorResults : [];
    const failedDetectors = detectorResults
      .filter((detector) => detector && typeof detector === "object" && (detector as Record<string, unknown>).passed === false)
      .map((detector) => (detector as Record<string, unknown>).label)
      .filter((label): label is string => typeof label === "string")
      .slice(0, 6);
    const passedDetectors = detectorResults
      .filter((detector) => detector && typeof detector === "object" && (detector as Record<string, unknown>).passed === true)
      .map((detector) => (detector as Record<string, unknown>).label)
      .filter((label): label is string => typeof label === "string")
      .slice(0, 6);

    return schemaByName.PageUXAnalysis.parse({
      pageType,
      summary: "AI sağlayıcısı doğrulanmış çıktı üretemediği için yerel yapılandırılmış sayfa analizi oluşturuldu.",
      strengths: passedDetectors,
      weaknesses: failedDetectors,
      missedOpportunities: failedDetectors,
      detectedPatterns: passedDetectors,
      ecommerceFindings: {
        conversion: filterByWords(failedDetectors, ["cart", "cta", "conversion", "price", "variant", "stock"]),
        trust: [],
        navigation: filterByWords(failedDetectors, ["navigation", "search", "category", "filter", "sort"]),
        productDiscovery: filterByWords(failedDetectors, ["product", "grid", "filter", "sort", "category"]),
        mobileExperience: [],
        content: []
      },
      technicalFindings: {
        performance: filterByWords(failedDetectors, ["console", "network", "DOM", "script"]),
        seo: filterByWords(failedDetectors, ["H1", "meta", "link", "alt"]),
        accessibility: filterByWords(failedDetectors, ["button", "label", "alt", "accessible"]),
        frontendQuality: failedDetectors
      },
      priorityScore: Math.min(100, failedDetectors.length * 10)
    }) as T;
  }
}

export function getDefaultAIProvider(): AIProvider {
  return getEnv().OPENAI_API_KEY ? new OpenAICompatibleProvider() : new LocalStructuredFallbackProvider();
}

function extractInputJSON(prompt: string) {
  const marker = "INPUT_JSON:";
  const markerIndex = prompt.indexOf(marker);

  if (markerIndex < 0) {
    return {};
  }

  try {
    return JSON.parse(prompt.slice(markerIndex + marker.length).trim());
  } catch {
    return {};
  }
}

function inferBrandName(title: string) {
  const trimmed = title.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.split(/[-|–—]/)[0]?.trim() || null;
}

function inferEcommerceType(text: string) {
  const normalized = text.toLowerCase();

  if (/(fashion|clothing|apparel|shoe|dress|giyim|ayakkabi|ayakkabı)/.test(normalized)) {
    return "fashion";
  }

  if (/(electronics|phone|laptop|computer|teknoloji|elektronik)/.test(normalized)) {
    return "electronics";
  }

  if (/(beauty|cosmetic|makeup|kozmetik|guzellik|güzellik)/.test(normalized)) {
    return "beauty";
  }

  if (/(home|furniture|decor|mobilya|ev)/.test(normalized)) {
    return "home_living";
  }

  if (/(sport|fitness|outdoor)/.test(normalized)) {
    return "sports";
  }

  if (/(grocery|market|supermarket|food|gida|gıda)/.test(normalized)) {
    return "grocery";
  }

  if (/(marketplace|seller|satici|satıcı)/.test(normalized)) {
    return "marketplace";
  }

  return "other";
}

function filterByWords(values: string[], words: string[]) {
  return values.filter((value) => words.some((word) => value.toLowerCase().includes(word.toLowerCase())));
}

function detectorLabels(detectors: unknown[], passed: boolean) {
  return detectors
    .filter((detector) => detector && typeof detector === "object" && (detector as Record<string, unknown>).passed === passed)
    .map((detector) => (detector as Record<string, unknown>).label)
    .filter((label): label is string => typeof label === "string");
}

function buildFallbackOpportunities(input: Record<string, unknown>) {
  const pages = getRecordArray(input.customerPages);
  const scorecard = asRecord(input.scorecard);
  const competitorComparison = asRecord(input.competitorComparison);
  const opportunities: Array<Record<string, unknown>> = [];

  for (const gap of getRecordArray(competitorComparison?.gaps).slice(0, 8)) {
    opportunities.push(opportunityFromCompetitorGap(gap));
  }

  for (const page of pages) {
    const pageType = getString(page.pageType, "unknown");
    const affectedPage = pageType !== "unknown" ? pageType : getString(page.url, "unknown");

    for (const detector of getRecordArray(page.detectorResults).filter((candidate) => candidate.passed === false).slice(0, 6)) {
      opportunities.push(opportunityFromDetector(detector, affectedPage));
    }

    for (const violation of getRecordArray(asRecord(page.accessibility)?.violations).slice(0, 3)) {
      opportunities.push(opportunityFromAccessibilityViolation(violation, affectedPage));
    }

    for (const lighthouseOpportunity of getRecordArray(asRecord(page.lighthouse)?.opportunities)
      .filter((candidate) => typeof candidate.score === "number" && candidate.score < 1)
      .slice(0, 3)) {
      opportunities.push(opportunityFromLighthouse(lighthouseOpportunity, affectedPage));
    }

    for (const missedOpportunity of getStringArray(asRecord(page.aiAnalysis)?.missedOpportunities).slice(0, 3)) {
      opportunities.push(opportunityFromAIFinding(missedOpportunity, affectedPage));
    }
  }

  for (const scoreOpportunity of opportunitiesFromScorecard(scorecard)) {
    opportunities.push(scoreOpportunity);
  }

  const deduped = dedupeOpportunities(opportunities);
  const fillerEvidence =
    pages[0] && typeof pages[0].url === "string"
      ? [`Crawl edilen sayfa kanıtı: ${getString(pages[0].pageType, "sayfa")} ${pages[0].url}`]
      : ["Audit kanıtı: crawler, detector, teknik audit ve AI analizi adımlarından üretildi."];

  while (deduped.length < 5) {
    deduped.push(fallbackOpportunity(deduped.length, fillerEvidence));
  }

  return deduped.slice(0, 15);
}

function opportunityFromCompetitorGap(gap: Record<string, unknown>) {
  const area = getString(gap.area, "Rakip karşılaştırma açığı");
  const impact = getImpact(gap.impact);
  const category = inferOpportunityCategory(area);
  const evidence = getStringArray(gap.evidence);

  return {
    title: titleForFinding(area, "home", true),
    description: `${getString(gap.customerCurrentState, `Müşteri kanıtı "${area}" alanında zayıf.`)} ${getString(
      gap.competitorObservation,
      `Rakip kanıtı "${area}" paterninin bulunduğunu gösteriyor.`
    )}`,
    evidence: evidence.length > 0 ? evidence : [`Rakip karşılaştırma açığı: ${area}`],
    affectedPages: ["home"],
    category,
    priority: impact === "high" ? "high" : "medium",
    estimatedEffort: effortForFinding(area),
    expectedImpact: impact === "low" ? "medium" : impact,
    implementationComplexity: complexityForFinding(area),
    suggestedImplementation: getString(gap.recommendation, `Ana sayfada eksik olan "${area}" paternini uygulanabilir bir bileşen veya içerik düzeniyle tamamlayın.`),
    acceptanceCriteria: acceptanceCriteriaForFinding(area, "home"),
    relatedCompetitorExamples: evidence.filter((item) => /competitor|rakip/i.test(item)).slice(0, 4)
  };
}

function opportunityFromDetector(detector: Record<string, unknown>, affectedPage: string) {
  const label = getString(detector.label, getString(detector.key, "Detector bulgusu"));
  const severity = getString(detector.severity, "medium");
  const category = inferOpportunityCategory(label);
  const evidence = [`${affectedPage.toUpperCase()} kontrolü: ${getString(detector.key, label)}=false`, ...getStringArray(detector.evidence)];

  return {
    title: titleForFinding(label, affectedPage, false),
    description: `${affectedPage.toUpperCase()} audit kanıtı bu kontrolün geçmediğini gösteriyor: ${label}. Bulguyu somut bir sayfa iyileştirme işi olarak ele alın.`,
    evidence: evidence.slice(0, 8),
    affectedPages: [affectedPage],
    category,
    priority: severity === "high" ? "high" : severity === "medium" ? "medium" : "low",
    estimatedEffort: effortForFinding(label),
    expectedImpact: category === "conversion" || category === "accessibility" ? "high" : "medium",
    implementationComplexity: complexityForFinding(label),
    suggestedImplementation: implementationForFinding(label, affectedPage),
    acceptanceCriteria: acceptanceCriteriaForFinding(label, affectedPage),
    relatedCompetitorExamples: []
  };
}

function opportunityFromAccessibilityViolation(violation: Record<string, unknown>, affectedPage: string) {
  const title = getString(violation.help, getString(violation.id, "Erişilebilirlik ihlali"));
  const impact = getString(violation.impact, "moderate");
  const evidence = [`${affectedPage.toUpperCase()} axe ihlali: ${getString(violation.id, title)}`];

  return {
    title: `Erişilebilirlik sorununu düzelt: ${title}`,
    description: `${affectedPage.toUpperCase()} erişilebilirlik auditi, hedefli bir frontend düzenlemesiyle çözülmesi gereken bir axe ihlali buldu.`,
    evidence,
    affectedPages: [affectedPage],
    category: "accessibility",
    priority: impact === "critical" || impact === "serious" ? "critical" : "high",
    estimatedEffort: "1_day",
    expectedImpact: "high",
    implementationComplexity: "medium",
    suggestedImplementation: `${affectedPage} markup yapısını güncelleyerek "${title}" axe ihlalinin tekrar görünmemesini sağlayın.`,
    acceptanceCriteria: [
      `${affectedPage} sayfası "${getString(violation.id, title)}" axe ihlalini artık raporlamıyor.`,
      "Klavye ve ekran okuyucu dostu semantik yapı korunuyor.",
      "Erişilebilirlik audit sonucu bu ihlal olmadan kaydediliyor."
    ],
    relatedCompetitorExamples: []
  };
}

function opportunityFromLighthouse(lighthouseOpportunity: Record<string, unknown>, affectedPage: string) {
  const title = getString(lighthouseOpportunity.title, "Lighthouse performans fırsatı");
  const evidence = [
    `${affectedPage.toUpperCase()} Lighthouse fırsatı: ${getString(lighthouseOpportunity.id, title)}`,
    getString(lighthouseOpportunity.displayValue, "")
  ].filter(Boolean);

  return {
    title: `Lighthouse fırsatını çöz: ${title}`,
    description: `${affectedPage.toUpperCase()} Lighthouse sonucu, yükleme kalitesini veya frontend teslimini iyileştirebilecek teknik bir fırsat içeriyor.`,
    evidence,
    affectedPages: [affectedPage],
    category: inferOpportunityCategory(title),
    priority: "medium",
    estimatedEffort: "1_day",
    expectedImpact: "medium",
    implementationComplexity: "medium",
    suggestedImplementation: `"${title}" Lighthouse bulgusunu inceleyip fırsatı kaldıracak en küçük frontend veya teslimat iyileştirmesini uygulayın.`,
    acceptanceCriteria: [
      `"${title}" Lighthouse fırsatı artık görünmüyor veya sayısal etkisi belirgin şekilde azalıyor.`,
      "Sayfa desktop ve mobilde doğru render edilmeye devam ediyor.",
      "Yeni erişilebilirlik ihlali oluşmuyor."
    ],
    relatedCompetitorExamples: []
  };
}

function opportunityFromAIFinding(finding: string, affectedPage: string) {
  return {
    title: titleForFinding(finding, affectedPage, false),
    description: `${affectedPage.toUpperCase()} AI analizi bunu kaçırılmış fırsat olarak işaretledi. Detector kanıtıyla desteklenen kapsamlı bir uygulama işine dönüştürün.`,
    evidence: [`${affectedPage.toUpperCase()} AI kaçırılmış fırsat: ${finding}`],
    affectedPages: [affectedPage],
    category: inferOpportunityCategory(finding),
    priority: "medium",
    estimatedEffort: effortForFinding(finding),
    expectedImpact: "medium",
    implementationComplexity: complexityForFinding(finding),
    suggestedImplementation: implementationForFinding(finding, affectedPage),
    acceptanceCriteria: acceptanceCriteriaForFinding(finding, affectedPage),
    relatedCompetitorExamples: []
  };
}

function opportunitiesFromScorecard(scorecard?: Record<string, unknown>) {
  if (!scorecard) {
    return [];
  }

  const scoreEntries = [
    ["conversion", "conversion", "Düşük skorlu dönüşüm akışı kontrollerini iyileştir"],
    ["ux", "ux", "Öncelikli UX detector bulgularını çöz"],
    ["seo", "seo", "SEO metadata ve semantik yapı açıklarını düzelt"],
    ["accessibility", "accessibility", "Audit edilen sayfalardaki erişilebilirlik riskini azalt"],
    ["performance", "performance", "Audit edilen sayfalardaki performans fırsatlarını iyileştir"]
  ] as const;

  return scoreEntries
    .filter(([key]) => typeof scorecard[key] === "number" && (scorecard[key] as number) < 75)
    .map(([key, category, title]) => ({
      title,
      description: `Deterministik skor kartı ${key} skorunun hedef eşiğin altında olduğunu gösteriyor. İlgili kanıtları kapsamı net bir uygulama işinde gruplayın.`,
      evidence: [`Skor kartı ${key}: ${Math.round(scorecard[key] as number)}`],
      affectedPages: ["audit-wide"],
      category,
      priority: (scorecard[key] as number) < 40 ? "high" : "medium",
      estimatedEffort: key === "performance" ? "2_3_days" : "1_day",
      expectedImpact: (scorecard[key] as number) < 40 ? "high" : "medium",
      implementationComplexity: key === "performance" ? "medium" : "low",
      suggestedImplementation: `Audit edilen sayfalardaki başarısız ${key} kanıtlarını inceleyin ve önce tekrar eden kontrolleri çözün.`,
      acceptanceCriteria: [
        `Audit tekrar çalıştırıldığında ${key} skoru önceki skora göre iyileşiyor.`,
        "Uygulama işi, görevi gerekçelendiren detector, Lighthouse veya erişilebilirlik kanıtına referans veriyor."
      ],
      relatedCompetitorExamples: []
    }));
}

function fallbackOpportunity(index: number, evidence: string[]) {
  const fallbackItems = [
    ["Kanıta dayalı ana sayfa iyileştirme turu yap", "ux"],
    ["En önemli dönüşüm detector hatalarını çöz", "conversion"],
    ["Metadata ve semantik içerik açıklarını düzelt", "seo"],
    ["Audit erişilebilirlik sorunlarını temizle", "accessibility"],
    ["Audit sırasında bulunan frontend kalite sorunlarını azalt", "frontend"]
  ] as const;
  const [title, category] = fallbackItems[index % fallbackItems.length];

  return {
    title,
    description: "Fırsat listesi uygulamaya hazır kalsın diye mevcut audit kanıtlarından fallback görev olarak üretildi.",
    evidence,
    affectedPages: ["audit-wide"],
    category,
    priority: "medium",
    estimatedEffort: "1_day",
    expectedImpact: "medium",
    implementationComplexity: "medium",
    suggestedImplementation: "Referans verilen audit kanıtını inceleyin ve en yüksek etkili tekrar eden sorunu kapsamı net bir uygulama değişikliğine dönüştürün.",
    acceptanceCriteria: [
      "Referans verilen audit kanıtı somut bir uygulama değişikliğiyle ele alınıyor.",
      "Audit tekrar çalıştırıldığında ilgili bulgu iyileşiyor veya kalkıyor."
    ],
    relatedCompetitorExamples: []
  };
}

function dedupeOpportunities(opportunities: Array<Record<string, unknown>>) {
  const seen = new Set<string>();
  const deduped: Array<Record<string, unknown>> = [];

  for (const opportunity of opportunities) {
    const title = getString(opportunity.title, "");
    const key = title.toLowerCase().replace(/\s+/g, " ").trim();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(opportunity);
  }

  return deduped;
}

function titleForFinding(finding: string, affectedPage: string, competitorBacked: boolean) {
  const text = finding.toLowerCase();
  const prefix = competitorBacked ? "Rakip açığını kapat: " : "";

  if (text.includes("cta")) {
    return `${prefix}${affectedPage} sayfasına net bir ana CTA ekle`;
  }

  if (text.includes("category shortcut") || text.includes("kategori")) {
    return `${prefix}${affectedPage} sayfasına kategori kısayolları ekle`;
  }

  if (text.includes("search input") || text.includes("arama")) {
    return `${prefix}${affectedPage} sayfasına görünür arama girişi ekle`;
  }

  if (text.includes("header navigation") || text.includes("navigasyon")) {
    return `${prefix}${affectedPage} sayfasında üst navigasyonu güçlendir`;
  }

  if (text.includes("mobile menu") || text.includes("mobil menü")) {
    return `${prefix}${affectedPage} sayfasına güvenilir mobil menü sinyali ekle`;
  }

  if (text.includes("footer links") || text.includes("footer")) {
    return `${prefix}${affectedPage} sayfasına footer destek ve politika linkleri ekle`;
  }

  if (text.includes("meta description") || text.includes("meta açıklama")) {
    return `${prefix}${affectedPage} sayfası için meta açıklama yaz`;
  }

  if (text.includes("alt")) {
    return `${prefix}${affectedPage} sayfasında eksik görsel alt metinlerini tamamla`;
  }

  if ((text.includes("link") && text.includes("text")) || text.includes("metinsiz link")) {
    return `${prefix}${affectedPage} sayfasındaki boş veya belirsiz link metinlerini düzelt`;
  }

  if (text.includes("add to cart") || text.includes("sepete")) {
    return `${prefix}${affectedPage} sayfasında sepete ekle görünürlüğünü iyileştir`;
  }

  return `${prefix}${affectedPage} bulgusunu çöz: ${finding}`;
}

function implementationForFinding(finding: string, affectedPage: string) {
  const text = finding.toLowerCase();

  if (text.includes("cta")) {
    return `${affectedPage} ana içeriğinin yakınına görsel olarak belirgin bir CTA ekleyin ve metnin bir sonraki aksiyonu açıkça anlattığını doğrulayın.`;
  }

  if (text.includes("category") || text.includes("kategori")) {
    return `${affectedPage} sayfasına 6-8 yüksek değerli hedef içeren responsive kategori kısayol bloğu ekleyin.`;
  }

  if (text.includes("search") || text.includes("arama")) {
    return `${affectedPage} header alanında arama alanı veya arama tetikleyicisi gösterin ve mobilde erişilebilir tutun.`;
  }

  if (text.includes("meta description") || text.includes("meta açıklama")) {
    return `${affectedPage} için sayfaya özel kısa bir meta açıklama yazın ve document head içinde render edin.`;
  }

  if (text.includes("alt")) {
    return `${affectedPage} sayfasındaki görünür görselleri inceleyin; anlamlı görsellere alt metin, dekoratif görsellere boş alt niteliği ekleyin.`;
  }

  return `${affectedPage} sayfası uygulamasını "${finding}" bulgusunu doğrudan ele alacak ve tekrar auditte doğrulanabilecek şekilde güncelleyin.`;
}

function acceptanceCriteriaForFinding(finding: string, affectedPage: string) {
  return [
    `${affectedPage} sayfası uygulaması "${finding}" bulgusunu doğrudan ele alıyor.`,
    "İlgili detector, Lighthouse, erişilebilirlik veya AI kanıtı bir sonraki auditte iyileşiyor.",
    "Değişiklik desktop ve mobil görünümde doğrulanıyor."
  ];
}

function effortForFinding(finding: string) {
  const text = finding.toLowerCase();

  if (/(meta description|alt|link text|button)/.test(text)) {
    return "half_day";
  }

  if (/(cta|promo|footer|h1|landmark)/.test(text)) {
    return "1_day";
  }

  if (/(category|navigation|mobile menu|filter|sort|gallery|shipping|return)/.test(text)) {
    return "2_3_days";
  }

  if (/(search|sticky|checkout|performance|script|render-blocking)/.test(text)) {
    return "1_week";
  }

  return "1_day";
}

function complexityForFinding(finding: string) {
  const text = finding.toLowerCase();

  if (/(meta description|alt|link text|button|h1|footer)/.test(text)) {
    return "low";
  }

  if (/(search|sticky|checkout|performance|script|render-blocking)/.test(text)) {
    return "high";
  }

  return "medium";
}

function inferOpportunityCategory(finding: string) {
  const text = finding.toLowerCase();

  if (/(cart|cta|price|conversion|stock|variant|checkout|sticky)/.test(text)) {
    return "conversion";
  }

  if (/(filter|sort|category|product discovery|merchandising)/.test(text)) {
    return "merchandising";
  }

  if (/(navigation|search|hero|mobile menu|footer)/.test(text)) {
    return "ux";
  }

  if (/(meta|h1|seo|description)/.test(text)) {
    return "seo";
  }

  if (/(accessib|alt|label|button|link text|landmark)/.test(text)) {
    return "accessibility";
  }

  if (/(performance|lighthouse|blocking|image|redirect|server response|paint|script|compression)/.test(text)) {
    return "performance";
  }

  if (/(console|network|frontend|dom)/.test(text)) {
    return "frontend";
  }

  if (/(content|promo|trust|copy)/.test(text)) {
    return "content";
  }

  return "ux";
}

function getImpact(value: unknown): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "medium";
}

function getRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}
