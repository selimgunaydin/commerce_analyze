import { z } from "zod";

export const siteProfileSchema = z.object({
  brandName: z.string().nullable(),
  likelyIndustry: z.string().min(1),
  ecommerceType: z.enum(["fashion", "electronics", "grocery", "beauty", "home_living", "sports", "marketplace", "other"]),
  targetAudience: z.string().min(1),
  pricePositioning: z.enum(["budget", "mid", "premium", "luxury", "unknown"]),
  mainProductCategories: z.array(z.string()).max(20),
  businessModel: z.enum(["b2c", "b2b", "marketplace", "unknown"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.array(z.string()).max(12)
});

export const pageUXAnalysisSchema = z.object({
  pageType: z.string().min(1),
  summary: z.string().min(1),
  strengths: z.array(z.string()).max(12),
  weaknesses: z.array(z.string()).max(12),
  missedOpportunities: z.array(z.string()).max(12),
  detectedPatterns: z.array(z.string()).max(16),
  ecommerceFindings: z.object({
    conversion: z.array(z.string()).max(10),
    trust: z.array(z.string()).max(10),
    navigation: z.array(z.string()).max(10),
    productDiscovery: z.array(z.string()).max(10),
    mobileExperience: z.array(z.string()).max(10),
    content: z.array(z.string()).max(10)
  }),
  technicalFindings: z.object({
    performance: z.array(z.string()).max(10),
    seo: z.array(z.string()).max(10),
    accessibility: z.array(z.string()).max(10),
    frontendQuality: z.array(z.string()).max(10)
  }),
  priorityScore: z.number().min(0).max(100)
});

export const competitorComparisonSchema = z.object({
  summary: z.string().min(1),
  customerAdvantages: z.array(z.string()).max(12),
  competitorAdvantages: z.array(z.string()).max(12),
  gaps: z
    .array(
      z.object({
        area: z.string().min(1),
        customerCurrentState: z.string().min(1),
        competitorObservation: z.string().min(1),
        recommendation: z.string().min(1),
        impact: z.enum(["low", "medium", "high"]),
        evidence: z.array(z.string()).max(10)
      })
    )
    .max(20)
});

export const auditOpportunitySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1).max(12),
  affectedPages: z.array(z.string().min(1)).min(1).max(12),
  category: z.enum([
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
  priority: z.enum(["low", "medium", "high", "critical"]),
  estimatedEffort: z.enum(["half_day", "1_day", "2_3_days", "1_week", "2_weeks_plus"]),
  expectedImpact: z.enum(["low", "medium", "high"]),
  implementationComplexity: z.enum(["low", "medium", "high"]),
  suggestedImplementation: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1).max(8),
  relatedCompetitorExamples: z.array(z.string().min(1)).max(8)
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
  topFindings: z.array(z.string().min(1)).max(12),
  competitorSummary: z.string().min(1),
  opportunities: z.array(auditOpportunitySchema),
  quickWins: z.array(auditOpportunitySchema),
  strategicProjects: z.array(auditOpportunitySchema),
  technicalAppendix: z.object({
    lighthouse: z.unknown(),
    accessibility: z.unknown(),
    crawledPages: z.array(z.string()),
    screenshots: z.array(z.string())
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
