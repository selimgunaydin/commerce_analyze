import { getEnv } from "@/src/lib/config/env";
import { z } from "zod";
import { buildRepairPrompt, parseJSONFromModelOutput } from "./json-repair";
import { schemaByName, schemaRepairGuides, type SchemaName } from "./schemas";

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
    let prompt = appendSchemaContract(params.prompt, params.schemaName);
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const output = await this.generateText({
        system: params.system,
        prompt
      });

      try {
        const parsed = parseJSONFromModelOutput(output);
        return schemaByName[params.schemaName].parse(normalizeParsedOutput(params.schemaName, parsed)) as T;
      } catch (error) {
        lastError = error;
        prompt = buildRepairPrompt({
          schemaName: params.schemaName,
          expectedShape: schemaRepairGuides[params.schemaName],
          invalidOutput: output,
          validationError: formatAIProviderError(error)
        });
      }
    }

    throw new Error(`AI output validation failed for ${params.schemaName}: ${formatAIProviderError(lastError)}`);
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
          temperature: 0.1,
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
    } catch (error) {
      if (isAbortError(error)) {
        throw new Error(`AI provider timed out after ${env.AI_TIMEOUT_MS}ms.`);
      }

      throw error;
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
    const missedCustomerOpportunities = failedDetectors
      .map((finding) => customerProblemForFinding(finding, pageType))
      .filter(Boolean)
      .slice(0, 6);

    return schemaByName.PageUXAnalysis.parse({
      pageType,
      summary: "AI sağlayıcısı doğrulanmış çıktı üretemediği için yerel yapılandırılmış sayfa analizi oluşturuldu.",
      strengths: passedDetectors,
      weaknesses: failedDetectors,
      missedOpportunities: missedCustomerOpportunities.length > 0 ? missedCustomerOpportunities : failedDetectors,
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

export function formatAIProviderError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 10)
      .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`)
      .join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function normalizeParsedOutput(schemaName: SchemaName, parsed: unknown) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }

  const candidate = parsed as Record<string, unknown>;

  if (schemaName === "PageUXAnalysis") {
    return {
      ...candidate,
      ecommerceFindings: ensureObject(candidate.ecommerceFindings),
      technicalFindings: ensureObject(candidate.technicalFindings)
    };
  }

  return candidate;
}

function appendSchemaContract(prompt: string, schemaName: SchemaName) {
  return [
    prompt,
    "OUTPUT_CONTRACT:",
    schemaRepairGuides[schemaName],
    "Return every required key. Use [] for empty arrays. Do not omit nested objects."
  ].join("\n");
}

function ensureObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isAbortError(error: unknown) {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    ((error as { name?: unknown }).name === "AbortError" ||
      (typeof (error as { message?: unknown }).message === "string" &&
        (error as { message: string }).message.toLowerCase().includes("aborted")))
  );
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
  const suggestedImplementation = getString(
    gap.recommendation,
    implementationForFinding(area, "home")
  );

  return {
    title: titleForFinding(area, "home", true),
    description: `${getString(gap.customerCurrentState, `Müşteri kanıtı "${area}" alanında zayıf.`)} ${getString(
      gap.competitorObservation,
      `Rakip kanıtı "${area}" paterninin bulunduğunu gösteriyor.`
    )}`,
    ...customerLensForFinding(area, "home"),
    evidence: evidence.length > 0 ? evidence : [`Rakip karşılaştırma açığı: ${area}`],
    affectedPages: ["home"],
    category,
    priority: impact === "high" ? "high" : "medium",
    estimatedEffort: effortForFinding(area),
    expectedImpact: impact === "low" ? "medium" : impact,
    implementationComplexity: complexityForFinding(area),
    suggestedImplementation,
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
    description: `${formatAffectedPage(affectedPage)} kanıtı "${label}" kontrolünü doğrulayamadı. ${implementationForFinding(label, affectedPage)}`,
    ...customerLensForFinding(label, affectedPage),
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
  const rawTitle = getString(violation.help, getString(violation.id, "Erişilebilirlik ihlali"));
  const title = translateAuditTitle(rawTitle);
  const impact = getString(violation.impact, "moderate");
  const violationId = getString(violation.id, rawTitle);
  const evidence = [`${affectedPage.toUpperCase()} axe ihlali: ${violationId}`];

  return {
    title: `Erişilebilirlik sorununu düzelt: ${title}`,
    description: `${affectedPage.toUpperCase()} erişilebilirlik auditi, hedefli bir frontend düzenlemesiyle çözülmesi gereken bir axe ihlali buldu.`,
    ...customerLensForFinding(title, affectedPage),
    evidence,
    affectedPages: [affectedPage],
    category: "accessibility",
    priority: impact === "critical" || impact === "serious" ? "critical" : "high",
    estimatedEffort: "1_day",
    expectedImpact: "high",
    implementationComplexity: "medium",
    suggestedImplementation: `${formatAffectedPage(affectedPage)} markup yapısını güncelleyerek "${title}" axe ihlalinin tekrar görünmemesini sağlayın.`,
    acceptanceCriteria: [
      `${formatAffectedPage(affectedPage)} "${violationId}" axe ihlalini artık raporlamıyor.`,
      "Klavye ve ekran okuyucu dostu semantik yapı korunuyor.",
      "Erişilebilirlik audit sonucu bu ihlal olmadan kaydediliyor."
    ],
    relatedCompetitorExamples: []
  };
}

function opportunityFromLighthouse(lighthouseOpportunity: Record<string, unknown>, affectedPage: string) {
  const rawTitle = getString(lighthouseOpportunity.title, "Lighthouse performans fırsatı");
  const title = translateAuditTitle(rawTitle);
  const evidence = [
    `${affectedPage.toUpperCase()} Lighthouse fırsatı: ${getString(lighthouseOpportunity.id, rawTitle)}`,
    getString(lighthouseOpportunity.displayValue, "")
  ].filter(Boolean);

  return {
    title: `Lighthouse fırsatını çöz: ${title}`,
    description: `${affectedPage.toUpperCase()} Lighthouse sonucu, yükleme kalitesini veya frontend teslimini iyileştirebilecek teknik bir fırsat içeriyor.`,
    ...customerLensForFinding(title, affectedPage),
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
    ...customerLensForFinding(finding, affectedPage),
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
      ...customerLensForFinding(title, "audit-wide"),
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
    ...customerLensForFinding(title, "audit-wide"),
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
  const byKey = new Map<string, Record<string, unknown>>();
  const deduped: Array<Record<string, unknown>> = [];

  for (const opportunity of opportunities) {
    const key = opportunityClusterKey(opportunity);

    if (!key) {
      continue;
    }

    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, opportunity);
      deduped.push(opportunity);
      continue;
    }

    mergeOpportunity(existing, opportunity);
  }

  return deduped;
}

function mergeOpportunity(target: Record<string, unknown>, source: Record<string, unknown>) {
  target.evidence = uniqueStrings([...getStringArray(target.evidence), ...getStringArray(source.evidence)]).slice(0, 12);
  target.affectedPages = uniqueStrings([...getStringArray(target.affectedPages), ...getStringArray(source.affectedPages)]).slice(0, 12);
  target.acceptanceCriteria = uniqueStrings([...getStringArray(target.acceptanceCriteria), ...getStringArray(source.acceptanceCriteria)]).slice(0, 8);
  target.relatedCompetitorExamples = uniqueStrings([
    ...getStringArray(target.relatedCompetitorExamples),
    ...getStringArray(source.relatedCompetitorExamples)
  ]).slice(0, 8);

  if (priorityRank(getString(source.priority, "low")) > priorityRank(getString(target.priority, "low"))) {
    target.priority = source.priority;
  }

  if (impactRank(getString(source.expectedImpact, "low")) > impactRank(getString(target.expectedImpact, "low"))) {
    target.expectedImpact = source.expectedImpact;
  }

  if (getString(source.title, "").startsWith("Rakip açığını kapat") && !getString(target.title, "").startsWith("Rakip açığını kapat")) {
    target.title = source.title;
    target.description = source.description;
  }
}

function opportunityClusterKey(opportunity: Record<string, unknown>) {
  const pages = getStringArray(opportunity.affectedPages).sort().join("|") || "audit-wide";
  const text = normalizedFinding(
    [
      getString(opportunity.title, ""),
      getString(opportunity.description, ""),
      getString(opportunity.category, ""),
      ...getStringArray(opportunity.evidence)
    ].join(" ")
  );
  const feature = opportunityFeatureKey(text);

  return `${pages}:${feature}`;
}

function opportunityFeatureKey(text: string) {
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

  return text
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join("-");
}

function titleForFinding(finding: string, affectedPage: string, competitorBacked: boolean) {
  const text = finding.toLowerCase();
  const prefix = competitorBacked ? "Rakip açığını kapat: " : "";

  if (/(hero|vitrin|ana görsel|ana gorsel)/.test(text)) {
    return `${prefix}${affectedPage} sayfasında hero alanı ve ana CTA'yı netleştir`;
  }

  if (/(h1|başlık|baslik)/.test(text)) {
    return `${prefix}${affectedPage} sayfasına anlamlı H1 başlığı ekle`;
  }

  if (/(loyalty|reward|points|puan|sadakat|üyelik|uyelik|club|kulüp|kulup|bonus|cashback)/.test(text)) {
    return `${prefix}${affectedPage} sayfasında sadakat ve puan avantajını görünür yap`;
  }

  if (/(sticky|sabit).*(cart|sepet)|sticky cart|sticky add to cart|sabit sepet/.test(text)) {
    return `${prefix}${affectedPage} sayfasında sabit sepete ekle akışı oluştur`;
  }

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
    return `${prefix}${affectedPage} sayfasında mobil menüyü erişilebilir ve kanıtlanabilir yap`;
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

  if (/(shipping|delivery|return|teslimat|kargo|iade)/.test(text)) {
    return `${prefix}${affectedPage} sayfasında kargo ve iade güvenini güçlendir`;
  }

  if (/(review|rating|yorum|değerlendirme|degerlendirme|star|yıldız|yildiz)/.test(text)) {
    return `${prefix}${affectedPage} sayfasında yorum ve sosyal kanıtı görünür yap`;
  }

  if (/(wishlist|favorite|favourite|favori|istek listesi)/.test(text)) {
    return `${prefix}${affectedPage} sayfasında favori aksiyonunu görünür ve izlenebilir yap`;
  }

  return `${prefix}${affectedPage} bulgusunu çöz: ${finding}`;
}

function implementationForFinding(finding: string, affectedPage: string) {
  const text = finding.toLowerCase();

  if (/(hero|vitrin|ana görsel|ana gorsel)/.test(text)) {
    return `${formatAffectedPage(affectedPage)} ilk görünümünde kampanya veya kategori odağını anlatan hero alanı, tek birincil CTA ve mobilde okunaklı görsel/metin yerleşimi oluşturun.`;
  }

  if (/(h1|başlık|baslik)/.test(text)) {
    return `${formatAffectedPage(affectedPage)} için sayfanın amacını anlatan tek, görünür ve SEO uyumlu H1 başlığı render edin.`;
  }

  if (/(loyalty|reward|points|puan|sadakat|üyelik|uyelik|club|kulüp|kulup|bonus|cashback)/.test(text)) {
    return `${formatAffectedPage(affectedPage)} içinde üyelik, puan kazanımı veya kulüp avantajını net bir mikro alanla gösterin; varsa hesap/giriş akışına bağlayın.`;
  }

  if (/(sticky|sabit).*(cart|sepet)|sticky cart|sticky add to cart|sabit sepet/.test(text)) {
    return `${formatAffectedPage(affectedPage)} ürün detayında mobil ve desktop için fiyat, varyant durumu ve sepete ekle aksiyonunu görünür tutan sticky CTA bileşeni ekleyin.`;
  }

  if (text.includes("cta")) {
    return `${formatAffectedPage(affectedPage)} ana içeriğinin yakınına görsel olarak belirgin bir CTA ekleyin ve metnin bir sonraki aksiyonu açıkça anlattığını doğrulayın.`;
  }

  if (text.includes("category") || text.includes("kategori")) {
    return `${formatAffectedPage(affectedPage)} içine 6-8 yüksek değerli hedef içeren responsive kategori kısayol bloğu ekleyin.`;
  }

  if (text.includes("search") || text.includes("arama")) {
    return `${formatAffectedPage(affectedPage)} header alanında arama alanı veya arama tetikleyicisi gösterin ve mobilde erişilebilir tutun.`;
  }

  if (text.includes("mobile menu") || text.includes("mobil menü")) {
    return `${formatAffectedPage(affectedPage)} mobil viewport'ta menü tetikleyicisinin aria-label, aria-expanded ve görünür ikonla erişilebilir biçimde yakalandığını doğrulayın; varsa mevcut menüyü detector'ın okuyabileceği semantik sinyallerle güçlendirin.`;
  }

  if (text.includes("meta description") || text.includes("meta açıklama")) {
    return `${formatAffectedPage(affectedPage)} için sayfaya özel kısa bir meta açıklama yazın ve document head içinde render edin.`;
  }

  if (text.includes("alt")) {
    return `${affectedPage} sayfasındaki görünür görselleri inceleyin; anlamlı görsellere alt metin, dekoratif görsellere boş alt niteliği ekleyin.`;
  }

  if (/(shipping|delivery|return|teslimat|kargo|iade)/.test(text)) {
    return `${formatAffectedPage(affectedPage)} içinde teslimat tarihi, ücretsiz kargo eşiği, iade süresi ve koşullarını satın alma kararına yakın konumda gösterin.`;
  }

  if (/(review|rating|yorum|değerlendirme|degerlendirme|star|yıldız|yildiz)/.test(text)) {
    return `${formatAffectedPage(affectedPage)} içine yorum, puan ortalaması veya müşteri memnuniyeti kanıtını ürün/karar alanına yakın ve erişilebilir şekilde ekleyin.`;
  }

  if (/(wishlist|favorite|favourite|favori|istek listesi)/.test(text)) {
    return `${formatAffectedPage(affectedPage)} ürün kartı veya ürün detayında favoriye ekleme aksiyonunu görünür, erişilebilir, event tracking'e uygun ve hesap akışıyla uyumlu hale getirin; özellik zaten varsa detector'ın yakalayacağı aria-label/title sinyallerini ekleyin.`;
  }

  return `${formatAffectedPage(affectedPage)} uygulamasını "${finding}" bulgusunu doğrudan ele alacak ve tekrar auditte doğrulanabilecek şekilde güncelleyin.`;
}

function acceptanceCriteriaForFinding(finding: string, affectedPage: string) {
  const text = finding.toLowerCase();

  if (/(loyalty|reward|points|puan|sadakat|üyelik|uyelik|club|kulüp|kulup|bonus|cashback)/.test(text)) {
    return [
      `${affectedPage} sayfasında sadakat/puan avantajı müşteri tarafından açıkça görülebiliyor.`,
      "Avantaj metni kayıt, giriş veya üyelik akışına doğru bağlantı veriyor.",
      "Audit tekrarında ilgili sadakat veya üyelik sinyali kanıt olarak yakalanıyor."
    ];
  }

  if (/(sticky|sabit).*(cart|sepet)|sticky cart|sticky add to cart|sabit sepet/.test(text)) {
    return [
      `${affectedPage} sayfasında sepete ekle aksiyonu scroll sırasında görünür kalıyor.`,
      "Sticky CTA mobilde fiyat/varyant durumunu bozmayacak şekilde çalışıyor.",
      "Audit tekrarında sabit sepete ekle sinyali yakalanıyor."
    ];
  }

  if (/(hero|vitrin|ana görsel|ana gorsel)/.test(text)) {
    return [
      `${formatAffectedPage(affectedPage)} ilk görünümünde hero mesajı, görseli ve birincil CTA birlikte görünüyor.`,
      "CTA metni müşterinin sonraki aksiyonunu açıkça anlatıyor.",
      "Mobil ve desktop ekran görüntülerinde hero alanı taşma veya örtüşme olmadan doğrulanıyor."
    ];
  }

  if (/(h1|başlık|baslik)/.test(text)) {
    return [
      `${formatAffectedPage(affectedPage)} tek ve anlamlı H1 render ediyor.`,
      "H1 sayfa amacıyla uyumlu, boş veya gizli değil.",
      "Tekrar auditte H1 detector'ı geçiyor."
    ];
  }

  if (text.includes("mobile menu") || text.includes("mobil menü")) {
    return [
      "Mobil viewport'ta menü tetikleyicisi görünür ve klavyeyle erişilebilir.",
      "Menü butonunda erişilebilir ad ve açık/kapalı durum sinyali bulunuyor.",
      "Tekrar auditte mobil menü sinyali kanıtla yakalanıyor."
    ];
  }

  if (/(wishlist|favorite|favourite|favori|istek listesi)/.test(text)) {
    return [
      "Favori aksiyonu ilgili ürün kartı veya ürün detay alanında görünür.",
      "Aksiyonun erişilebilir adı ve giriş/hesap akışı davranışı net.",
      "Tekrar auditte favori sinyali kanıtla yakalanıyor."
    ];
  }

  return [
    `${affectedPage} sayfası uygulaması "${finding}" bulgusunu doğrudan ele alıyor.`,
    "İlgili detector, Lighthouse, erişilebilirlik veya AI kanıtı bir sonraki auditte iyileşiyor.",
    "Değişiklik desktop ve mobil görünümde doğrulanıyor."
  ];
}

function customerLensForFinding(finding: string, affectedPage: string) {
  return {
    customerJourneyStage: journeyStageForFinding(finding, affectedPage),
    customerProblem: customerProblemForFinding(finding, affectedPage),
    customerBenefit: customerBenefitForFinding(finding, affectedPage),
    businessRationale: businessRationaleForFinding(finding, affectedPage)
  };
}

function journeyStageForFinding(finding: string, affectedPage: string) {
  const text = normalizedFinding(`${finding} ${affectedPage}`);

  if (/(loyalty|reward|points|puan|sadakat|uyelik|club|kulup|bonus|cashback)/.test(text)) {
    return "retention";
  }

  if (/(sticky|sabit|cart|sepet|checkout|odeme|payment|taksit|buy now|satın al|satin al)/.test(text)) {
    return "purchase";
  }

  if (/(shipping|delivery|return|teslimat|kargo|iade)/.test(text)) {
    return "evaluation";
  }

  if (/(search|arama|category|kategori|filter|filtre|sort|sirala|product grid|urun listesi|ürün listesi|navigation|navigasyon)/.test(text)) {
    return "discovery";
  }

  if (/(review|rating|yorum|degerlendirme|star|yildiz|size|beden|variant|varyant|stock|stok|wishlist|favori)/.test(text)) {
    return "evaluation";
  }

  if (/(support|destek|yardim|yardım|contact|iletisim|iletişim)/.test(text)) {
    return "post_purchase";
  }

  return affectedPage === "home" || affectedPage === "plp" ? "discovery" : "evaluation";
}

function customerProblemForFinding(finding: string, affectedPage: string) {
  const text = normalizedFinding(`${finding} ${affectedPage}`);

  if (/(loyalty|reward|points|puan|sadakat|uyelik|club|kulup|bonus|cashback)/.test(text)) {
    return "Müşteri alışverişin kendisine geri dönen bir avantaj sağlayıp sağlamadığını göremiyor; rakipte puan veya üyelik avantajı varsa tekrar satın alma motivasyonu zayıflar.";
  }

  if (/(sticky|sabit).*(cart|sepet)|sticky cart|sticky add to cart|sabit sepet/.test(text)) {
    return "Müşteri ürün detayında karar verdiği anda sepete ekle aksiyonunu tekrar aramak zorunda kalabilir; bu özellikle mobilde satın alma sürtünmesi yaratır.";
  }

  if (/(cart|sepet|checkout|buy now|satın al|satin al)/.test(text)) {
    return "Müşteri satın alma niyetindeyken bir sonraki aksiyon yeterince görünür olmadığı için karar akışı kesintiye uğrayabilir.";
  }

  if (/(shipping|delivery|return|teslimat|kargo|iade)/.test(text)) {
    return "Müşteri teslimat veya iade koşullarını karar anında net göremezse sipariş riskini yüksek algılayabilir.";
  }

  if (/(review|rating|yorum|degerlendirme|star|yildiz|social proof|memnuniyet)/.test(text)) {
    return "Müşteri ürünü veya markayı başkalarının deneyimiyle doğrulayamıyor; güven kararı daha fazla zihinsel efor gerektiriyor.";
  }

  if (/(wishlist|favorite|favourite|favori|istek listesi)/.test(text)) {
    return "Müşteri beğendiği ürünü sonra dönmek üzere kolayca saklayamazsa değerlendirme süreci kopabilir.";
  }

  if (/(search|arama|category|kategori|filter|filtre|sort|sirala|navigation|navigasyon)/.test(text)) {
    return "Müşteri aradığı ürüne hızlı ulaşmak için daha fazla gezinmek zorunda kalır; keşif süreci uzar ve terk riski artar.";
  }

  if (/(size|beden|variant|varyant|stock|stok)/.test(text)) {
    return "Müşteri uygun seçenek, stok veya beden bilgisini net göremediğinde satın alma kararını erteleyebilir.";
  }

  if (/(accessib|alt|label|button|link text|landmark|erişilebilir|erisilebilir)/.test(text)) {
    return "Klavye, ekran okuyucu veya yardımcı teknoloji kullanan müşteri temel aksiyonları güvenle tamamlayamayabilir.";
  }

  if (/(performance|lighthouse|blocking|paint|script|image|render|server response)/.test(text)) {
    return "Müşteri sayfanın yüklenmesini veya etkileşime hazır hale gelmesini beklerken alışveriş niyetini kaybedebilir.";
  }

  if (/(meta|h1|seo|description|açıklama|aciklama)/.test(text)) {
    return "Müşteri arama sonucu veya sayfa başlığından neyle karşılaşacağını yeterince hızlı anlayamayabilir.";
  }

  return "Müşteri yolculuğunda bu temas noktası yeterince net olmadığı için alışveriş deneyimi beklenenden daha fazla efor gerektirir.";
}

function customerBenefitForFinding(finding: string, affectedPage: string) {
  const stage = journeyStageForFinding(finding, affectedPage);

  if (stage === "retention") {
    return "Müşteri markayla tekrar alışveriş yapmak için somut bir neden görür; üyelik veya puan avantajı daha anlaşılır hale gelir.";
  }

  if (stage === "purchase") {
    return "Müşteri karar verdiği anda aksiyona daha hızlı ulaşır ve sepete ekleme adımı daha az sürtünmeyle tamamlanır.";
  }

  if (stage === "discovery") {
    return "Müşteri aradığı ürünü veya kategoriyi daha kısa sürede bulur; keşif deneyimi daha kontrollü ve akıcı hissedilir.";
  }

  if (stage === "post_purchase") {
    return "Müşteri destek, teslimat veya iade beklentisini daha rahat yönetir; satın alma sonrası belirsizlik azalır.";
  }

  return "Müşteri karar vermek için ihtiyaç duyduğu güven, bilgi ve karşılaştırma sinyallerine daha kolay ulaşır.";
}

function businessRationaleForFinding(finding: string, affectedPage: string) {
  const stage = journeyStageForFinding(finding, affectedPage);

  if (stage === "retention") {
    return "Tekrar satın alma ve üyelik aktivasyonu güçlenir; rakipteki sadakat avantajı kaynaklı müşteri kaybı riski azalır.";
  }

  if (stage === "purchase") {
    return "Satın alma niyetinin yüksek olduğu anda sürtünme azaldığı için sepete ekleme ve dönüşüm oranı üzerinde doğrudan etki beklenir.";
  }

  if (stage === "discovery") {
    return "Ürün keşfi kolaylaştıkça kategori gezinmesi, ürün görüntüleme ve kampanya etkileşimi artabilir.";
  }

  if (stage === "post_purchase") {
    return "Destek ihtiyacı ve iade belirsizliği azalır; güven algısı satın alma kararını destekler.";
  }

  return "Karar verme için gereken bilgi daha görünür olduğu için güven, ürün değerlendirme ve dönüşüm kalitesi iyileşir.";
}

function effortForFinding(finding: string) {
  const text = finding.toLowerCase();

  if (/(loyalty|reward|points|puan|sadakat|üyelik|uyelik|club|kulüp|kulup|bonus|cashback)/.test(text)) {
    return "1_week";
  }

  if (/(meta description|alt|link text|button)/.test(text)) {
    return "half_day";
  }

  if (/(cta|promo|footer|h1|landmark)/.test(text)) {
    return "1_day";
  }

  if (/(category|navigation|mobile menu|filter|sort|gallery|shipping|return|delivery|wishlist|favorite|favori)/.test(text)) {
    return "2_3_days";
  }

  if (/(search|sticky|checkout|performance|script|render-blocking)/.test(text)) {
    return "1_week";
  }

  return "1_day";
}

function complexityForFinding(finding: string) {
  const text = finding.toLowerCase();

  if (/(loyalty|reward|points|puan|sadakat|üyelik|uyelik|club|kulüp|kulup|bonus|cashback)/.test(text)) {
    return "high";
  }

  if (/(meta description|alt|link text|button|h1|footer)/.test(text)) {
    return "low";
  }

  if (/(search|sticky|checkout|performance|script|render-blocking)/.test(text)) {
    return "high";
  }

  return "medium";
}

function inferOpportunityCategory(finding: string) {
  const text = normalizedFinding(finding);

  if (/(loyalty|reward|points|puan|sadakat|uyelik|club|kulup|bonus|cashback)/.test(text)) {
    return "retention";
  }

  if (/(cart|cta|price|conversion|stock|variant|checkout|sticky)/.test(text)) {
    return "conversion";
  }

  if (/(trust|secure|guven|güven|shipping|delivery|return|teslimat|kargo|iade|review|rating|yorum|degerlendirme|support|destek|yardim)/.test(text)) {
    return "trust";
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

function translateAuditTitle(title: string) {
  const normalized = normalizedFinding(title);
  const translations: Array<[RegExp, string]> = [
    [/reduce initial server response time|server response time/, "İlk sunucu yanıt süresini azalt"],
    [/eliminate render-blocking resources|render-blocking resources/, "Render engelleyici kaynakları kaldır"],
    [/reduce unused css|unused css/, "Kullanılmayan CSS'i azalt"],
    [/elements must meet minimum color contrast ratio thresholds|color contrast/, "Metin ve arka plan kontrastını WCAG eşiğine getir"],
    [/documents must have <title> element|document should have a title|document-title/, "Sayfaya anlamlı document title ekle"],
    [/document should have one main landmark|landmark-one-main/, "Sayfada tek ana main landmark yapısı kullan"],
    [/image elements do not have alt attributes|image alt/, "Görsel alt metinlerini tamamla"],
    [/buttons must have discernible text|button name/, "Butonlara erişilebilir ad ekle"],
    [/links must have discernible text|link name/, "Linklere anlaşılır metin ekle"]
  ];

  return translations.find(([pattern]) => pattern.test(normalized))?.[1] ?? title;
}

function formatAffectedPage(page: string) {
  const labels: Record<string, string> = {
    home: "Ana sayfa",
    plp: "Listeleme sayfası",
    pdp: "Ürün detay sayfası",
    search: "Arama sayfası",
    campaign: "Kampanya sayfası",
    content: "İçerik sayfası",
    "audit-wide": "Audit kapsamı"
  };

  return labels[page] ?? page;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function priorityRank(value: string) {
  const ranks: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  };

  return ranks[value] ?? 0;
}

function impactRank(value: string) {
  const ranks: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3
  };

  return ranks[value] ?? 0;
}

function normalizedFinding(value: string) {
  return value
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
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
