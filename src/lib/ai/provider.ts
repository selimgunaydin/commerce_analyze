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
      const industryInput = typeof input.industryInput === "string" && input.industryInput ? input.industryInput : "Unknown ecommerce";

      return schemaByName.SiteProfile.parse({
        brandName: brandNameInput ?? inferBrandName(title),
        likelyIndustry: industryInput,
        ecommerceType: inferEcommerceType(`${title} ${homepage?.visibleText ?? ""}`),
        targetAudience: "Unknown ecommerce shoppers",
        pricePositioning: "unknown",
        mainProductCategories: Array.isArray(homepage?.detectedCategories) ? homepage.detectedCategories.slice(0, 8) : [],
        businessModel: "unknown",
        confidence: 0.2,
        reasoning: ["OPENAI_API_KEY is not configured; local structured fallback used."]
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
          customerCurrentState: `Customer detector did not pass: ${label}`,
          competitorObservation: `At least one competitor detector passed: ${label}`,
          recommendation: `Review the competitor evidence and add a stronger ${label.toLowerCase()} pattern where it fits the customer experience.`,
          impact: "medium" as const,
          evidence: [`Customer detector: ${label}=false`, `Competitor detector: ${label}=true`]
        }));

      return schemaByName.CompetitorComparison.parse({
        summary: "Local structured fallback comparison generated because no AI provider key is configured.",
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
      summary: "Local structured fallback generated because no AI provider key is configured.",
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
      ? [`Crawled page evidence: ${getString(pages[0].pageType, "page")} ${pages[0].url}`]
      : ["Audit evidence: generated after crawler, detector, technical, and AI analysis steps."];

  while (deduped.length < 5) {
    deduped.push(fallbackOpportunity(deduped.length, fillerEvidence));
  }

  return deduped.slice(0, 15);
}

function opportunityFromCompetitorGap(gap: Record<string, unknown>) {
  const area = getString(gap.area, "Competitor gap");
  const impact = getImpact(gap.impact);
  const category = inferOpportunityCategory(area);
  const evidence = getStringArray(gap.evidence);

  return {
    title: titleForFinding(area, "home", true),
    description: `${getString(gap.customerCurrentState, `Customer evidence is weaker for ${area}.`)} ${getString(
      gap.competitorObservation,
      `Competitor evidence shows the pattern for ${area}.`
    )}`,
    evidence: evidence.length > 0 ? evidence : [`Competitor comparison gap: ${area}`],
    affectedPages: ["home"],
    category,
    priority: impact === "high" ? "high" : "medium",
    estimatedEffort: effortForFinding(area),
    expectedImpact: impact === "low" ? "medium" : impact,
    implementationComplexity: complexityForFinding(area),
    suggestedImplementation: getString(gap.recommendation, `Implement the missing ${area.toLowerCase()} pattern on the homepage.`),
    acceptanceCriteria: acceptanceCriteriaForFinding(area, "home"),
    relatedCompetitorExamples: evidence.filter((item) => item.toLowerCase().includes("competitor")).slice(0, 4)
  };
}

function opportunityFromDetector(detector: Record<string, unknown>, affectedPage: string) {
  const label = getString(detector.label, getString(detector.key, "Detector issue"));
  const severity = getString(detector.severity, "medium");
  const category = inferOpportunityCategory(label);
  const evidence = [`${affectedPage.toUpperCase()} detector: ${getString(detector.key, label)}=false`, ...getStringArray(detector.evidence)];

  return {
    title: titleForFinding(label, affectedPage, false),
    description: `${affectedPage.toUpperCase()} audit evidence shows this detector did not pass: ${label}. Convert the finding into a concrete page improvement.`,
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
  const title = getString(violation.help, getString(violation.id, "Accessibility violation"));
  const impact = getString(violation.impact, "moderate");
  const evidence = [`${affectedPage.toUpperCase()} axe violation: ${getString(violation.id, title)}`];

  return {
    title: `Fix accessibility issue: ${title}`,
    description: `${affectedPage.toUpperCase()} accessibility audit found an axe violation that should be resolved with a targeted frontend fix.`,
    evidence,
    affectedPages: [affectedPage],
    category: "accessibility",
    priority: impact === "critical" || impact === "serious" ? "critical" : "high",
    estimatedEffort: "1_day",
    expectedImpact: "high",
    implementationComplexity: "medium",
    suggestedImplementation: `Update the affected ${affectedPage} markup so the axe violation "${title}" no longer appears.`,
    acceptanceCriteria: [
      `The ${affectedPage} page no longer reports the axe violation "${getString(violation.id, title)}".`,
      "Keyboard and screen reader friendly semantics are preserved.",
      "The accessibility audit result is saved without this violation."
    ],
    relatedCompetitorExamples: []
  };
}

function opportunityFromLighthouse(lighthouseOpportunity: Record<string, unknown>, affectedPage: string) {
  const title = getString(lighthouseOpportunity.title, "Lighthouse performance opportunity");
  const evidence = [
    `${affectedPage.toUpperCase()} Lighthouse opportunity: ${getString(lighthouseOpportunity.id, title)}`,
    getString(lighthouseOpportunity.displayValue, "")
  ].filter(Boolean);

  return {
    title: `Resolve Lighthouse opportunity: ${title}`,
    description: `${affectedPage.toUpperCase()} Lighthouse results include a technical opportunity that can improve loading quality or frontend delivery.`,
    evidence,
    affectedPages: [affectedPage],
    category: inferOpportunityCategory(title),
    priority: "medium",
    estimatedEffort: "1_day",
    expectedImpact: "medium",
    implementationComplexity: "medium",
    suggestedImplementation: `Review the Lighthouse audit "${title}" and apply the smallest frontend or delivery change that removes the opportunity.`,
    acceptanceCriteria: [
      `The Lighthouse opportunity "${title}" no longer appears or its numeric value is materially reduced.`,
      "The page still renders correctly on desktop and mobile.",
      "No new accessibility violations are introduced."
    ],
    relatedCompetitorExamples: []
  };
}

function opportunityFromAIFinding(finding: string, affectedPage: string) {
  return {
    title: titleForFinding(finding, affectedPage, false),
    description: `${affectedPage.toUpperCase()} AI analysis marked this as a missed opportunity. Turn it into a scoped implementation task backed by detector evidence.`,
    evidence: [`${affectedPage.toUpperCase()} AI missed opportunity: ${finding}`],
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
    ["conversion", "conversion", "Improve the lowest-scoring conversion journey checks"],
    ["ux", "ux", "Resolve priority UX detector failures"],
    ["seo", "seo", "Fix SEO metadata and semantic structure gaps"],
    ["accessibility", "accessibility", "Reduce accessibility risk on audited pages"],
    ["performance", "performance", "Improve audited page performance opportunities"]
  ] as const;

  return scoreEntries
    .filter(([key]) => typeof scorecard[key] === "number" && (scorecard[key] as number) < 75)
    .map(([key, category, title]) => ({
      title,
      description: `The deterministic scorecard shows ${key} below the target threshold. Group the related evidence into a scoped implementation task.`,
      evidence: [`Scorecard ${key}: ${Math.round(scorecard[key] as number)}`],
      affectedPages: ["audit-wide"],
      category,
      priority: (scorecard[key] as number) < 40 ? "high" : "medium",
      estimatedEffort: key === "performance" ? "2_3_days" : "1_day",
      expectedImpact: (scorecard[key] as number) < 40 ? "high" : "medium",
      implementationComplexity: key === "performance" ? "medium" : "low",
      suggestedImplementation: `Review failed ${key} evidence across audited pages and resolve the repeated checks first.`,
      acceptanceCriteria: [
        `The ${key} score improves above the previous score after rerunning the audit.`,
        "The implementation references the detector, Lighthouse, or accessibility evidence that justified the task."
      ],
      relatedCompetitorExamples: []
    }));
}

function fallbackOpportunity(index: number, evidence: string[]) {
  const fallbackItems = [
    ["Create an evidence-backed homepage remediation pass", "ux"],
    ["Resolve top conversion detector failures", "conversion"],
    ["Fix metadata and semantic content gaps", "seo"],
    ["Clean up accessibility issues from the audit", "accessibility"],
    ["Reduce frontend quality issues found during audit", "frontend"]
  ] as const;
  const [title, category] = fallbackItems[index % fallbackItems.length];

  return {
    title,
    description: "Generated as a fallback task from available audit evidence so the opportunity list remains implementation-ready.",
    evidence,
    affectedPages: ["audit-wide"],
    category,
    priority: "medium",
    estimatedEffort: "1_day",
    expectedImpact: "medium",
    implementationComplexity: "medium",
    suggestedImplementation: "Review the referenced audit evidence and convert the highest-impact repeated issue into a scoped implementation change.",
    acceptanceCriteria: [
      "The referenced audit evidence is addressed by a concrete implementation change.",
      "The audit can be rerun and the related finding is improved or removed."
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
  const prefix = competitorBacked ? "Close competitor gap: " : "";

  if (text.includes("cta")) {
    return `${prefix}Add a clear primary CTA to the ${affectedPage} page`;
  }

  if (text.includes("category shortcut")) {
    return `${prefix}Add category shortcut links to the ${affectedPage} page`;
  }

  if (text.includes("search input")) {
    return `${prefix}Add a visible search entry point to the ${affectedPage} page`;
  }

  if (text.includes("header navigation")) {
    return `${prefix}Strengthen header navigation on the ${affectedPage} page`;
  }

  if (text.includes("mobile menu")) {
    return `${prefix}Add a reliable mobile menu signal to the ${affectedPage} page`;
  }

  if (text.includes("footer links")) {
    return `${prefix}Add footer support and policy links to the ${affectedPage} page`;
  }

  if (text.includes("meta description")) {
    return `${prefix}Write a meta description for the ${affectedPage} page`;
  }

  if (text.includes("alt")) {
    return `${prefix}Add missing image alt text on the ${affectedPage} page`;
  }

  if (text.includes("link") && text.includes("text")) {
    return `${prefix}Fix empty or unclear link text on the ${affectedPage} page`;
  }

  if (text.includes("add to cart")) {
    return `${prefix}Improve add-to-cart visibility on the ${affectedPage} page`;
  }

  return `${prefix}Resolve ${affectedPage} finding: ${finding}`;
}

function implementationForFinding(finding: string, affectedPage: string) {
  const text = finding.toLowerCase();

  if (text.includes("cta")) {
    return `Add one visually prominent primary CTA near the main ${affectedPage} content and ensure its copy describes the next action.`;
  }

  if (text.includes("category")) {
    return `Add a responsive category shortcut block with 6-8 high-value destinations on the ${affectedPage} page.`;
  }

  if (text.includes("search")) {
    return `Expose a search field or search trigger in the ${affectedPage} header area and keep it reachable on mobile.`;
  }

  if (text.includes("meta description")) {
    return `Write a concise page-specific meta description and render it in the ${affectedPage} document head.`;
  }

  if (text.includes("alt")) {
    return `Audit visible images on the ${affectedPage} page and add meaningful alt text or decorative empty alt attributes where appropriate.`;
  }

  return `Update the ${affectedPage} page implementation so the finding "${finding}" is directly addressed and can be verified on rerun.`;
}

function acceptanceCriteriaForFinding(finding: string, affectedPage: string) {
  return [
    `The ${affectedPage} page implementation directly addresses "${finding}".`,
    "The related detector, Lighthouse, accessibility, or AI evidence improves on the next audit run.",
    "The change is verified on desktop and mobile viewports."
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
