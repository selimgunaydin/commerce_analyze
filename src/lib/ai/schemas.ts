import { z } from "zod";

const stringList = (max: number) =>
  z.preprocess((value) => {
    if (typeof value === "undefined") return value;
    if (!Array.isArray(value)) return value;

    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, max);
  }, z.array(z.string().min(1)).max(max).default([]));

const requiredStringList = (max: number) =>
  z.preprocess((value) => {
    if (!Array.isArray(value)) return value;

    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, max);
  }, z.array(z.string().min(1)).min(1).max(max));

function objectOrEmpty(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export const siteProfileSchema = z.object({
  brandName: z.string().nullable().default(null),
  likelyIndustry: z.string().min(1),
  ecommerceType: z.enum(["fashion", "electronics", "grocery", "beauty", "home_living", "sports", "marketplace", "other"]),
  targetAudience: z.string().min(1),
  pricePositioning: z.enum(["budget", "mid", "premium", "luxury", "unknown"]),
  mainProductCategories: stringList(20),
  businessModel: z.enum(["b2c", "b2b", "marketplace", "unknown"]),
  confidence: z.number().min(0).max(1),
  reasoning: stringList(12)
});

export const pageUXAnalysisSchema = z.object({
  pageType: z.string().min(1),
  summary: z.string().min(1),
  strengths: stringList(12),
  weaknesses: stringList(12),
  missedOpportunities: stringList(12),
  detectedPatterns: stringList(16),
  ecommerceFindings: z.preprocess(
    objectOrEmpty,
    z.object({
      conversion: stringList(10),
      trust: stringList(10),
      navigation: stringList(10),
      productDiscovery: stringList(10),
      mobileExperience: stringList(10),
      content: stringList(10)
    })
  ),
  technicalFindings: z.preprocess(
    objectOrEmpty,
    z.object({
      performance: stringList(10),
      seo: stringList(10),
      accessibility: stringList(10),
      frontendQuality: stringList(10)
    })
  ),
  priorityScore: z.number().min(0).max(100)
});

export const competitorComparisonSchema = z.object({
  summary: z.string().min(1),
  customerAdvantages: stringList(12),
  competitorAdvantages: stringList(12),
  gaps: z
    .array(
      z.object({
        area: z.string().min(1),
        customerCurrentState: z.string().min(1),
        competitorObservation: z.string().min(1),
        recommendation: z.string().min(1),
        impact: z.enum(["low", "medium", "high"]),
        evidence: stringList(10)
      })
    )
    .max(20)
});

export const auditOpportunitySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  evidence: requiredStringList(12),
  affectedPages: requiredStringList(12),
  category: z.enum([
    "ux",
    "ui",
    "performance",
    "seo",
    "accessibility",
    "conversion",
    "retention",
    "trust",
    "frontend",
    "analytics",
    "content",
    "merchandising"
  ]),
  customerJourneyStage: z.enum(["discovery", "evaluation", "purchase", "post_purchase", "retention"]),
  customerProblem: z.string().min(1),
  customerBenefit: z.string().min(1),
  businessRationale: z.string().min(1),
  priority: z.enum(["low", "medium", "high", "critical"]),
  estimatedEffort: z.enum(["half_day", "1_day", "2_3_days", "1_week", "2_weeks_plus"]),
  expectedImpact: z.enum(["low", "medium", "high"]),
  implementationComplexity: z.enum(["low", "medium", "high"]),
  suggestedImplementation: z.string().min(1),
  acceptanceCriteria: requiredStringList(8),
  relatedCompetitorExamples: stringList(8)
});

export const opportunityGenerationSchema = z.object({
  opportunities: z.array(auditOpportunitySchema).min(5).max(15)
});

export const auditScorecardSchema = z.object({
  ux: z.number().min(0).max(100),
  performance: z.number().min(0).max(100),
  seo: z.number().min(0).max(100),
  accessibility: z.number().min(0).max(100),
  conversion: z.number().min(0).max(100),
  competitorPositioning: z.number().min(0).max(100),
  overall: z.number().min(0).max(100)
});

export const finalAuditReportSchema = z.object({
  executiveSummary: z.string().min(1),
  siteProfile: siteProfileSchema,
  scorecard: auditScorecardSchema,
  topFindings: stringList(12),
  competitorSummary: z.string().min(1),
  opportunities: z.array(auditOpportunitySchema),
  quickWins: z.array(auditOpportunitySchema),
  strategicProjects: z.array(auditOpportunitySchema),
  technicalAppendix: z.object({
    lighthouse: z.unknown(),
    accessibility: z.unknown(),
    crawledPages: stringList(100),
    screenshots: stringList(100)
  })
});

export type SiteProfile = z.infer<typeof siteProfileSchema>;
export type PageUXAnalysis = z.infer<typeof pageUXAnalysisSchema>;
export type CompetitorComparison = z.infer<typeof competitorComparisonSchema>;
export type AuditOpportunity = z.infer<typeof auditOpportunitySchema>;
export type OpportunityGeneration = z.infer<typeof opportunityGenerationSchema>;
export type FinalAuditReport = z.infer<typeof finalAuditReportSchema>;

export const schemaByName = {
  SiteProfile: siteProfileSchema,
  PageUXAnalysis: pageUXAnalysisSchema,
  CompetitorComparison: competitorComparisonSchema,
  OpportunityGeneration: opportunityGenerationSchema,
  FinalAuditReport: finalAuditReportSchema
};

export type SchemaName = keyof typeof schemaByName;

export const schemaRepairGuides: Record<SchemaName, string> = {
  SiteProfile:
    "Required shape: { brandName: string|null, likelyIndustry: string, ecommerceType: enum, targetAudience: string, pricePositioning: enum, mainProductCategories: string[], businessModel: enum, confidence: number, reasoning: string[] }.",
  PageUXAnalysis:
    "Required shape: { pageType: string, summary: string, strengths: string[], weaknesses: string[], missedOpportunities: string[], detectedPatterns: string[], ecommerceFindings: { conversion: string[], trust: string[], navigation: string[], productDiscovery: string[], mobileExperience: string[], content: string[] }, technicalFindings: { performance: string[], seo: string[], accessibility: string[], frontendQuality: string[] }, priorityScore: number }. Use [] for empty finding groups.",
  CompetitorComparison:
    "Required shape: { summary: string, customerAdvantages: string[], competitorAdvantages: string[], gaps: [{ area, customerCurrentState, competitorObservation, recommendation, impact: low|medium|high, evidence: string[] }] }. Use [] when there is no reliable gap.",
  OpportunityGeneration:
    "Required shape: { opportunities: AuditOpportunity[] }. Return 5-15 opportunities. Every opportunity must include title, description, evidence, affectedPages, category, customerJourneyStage, customerProblem, customerBenefit, businessRationale, priority, estimatedEffort, expectedImpact, implementationComplexity, suggestedImplementation, acceptanceCriteria, relatedCompetitorExamples.",
  FinalAuditReport:
    "Required shape: { executiveSummary, siteProfile, scorecard, topFindings, competitorSummary, opportunities, quickWins, strategicProjects, technicalAppendix }. Preserve existing opportunities; do not invent new opportunity fields."
};
