export type LighthouseSummary = {
  url: string;
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  metrics: {
    firstContentfulPaint?: number;
    largestContentfulPaint?: number;
    totalBlockingTime?: number;
    cumulativeLayoutShift?: number;
    speedIndex?: number;
  };
  opportunities: {
    id: string;
    title: string;
    description?: string;
    score?: number | null;
    numericValue?: number | null;
    displayValue?: string;
  }[];
  diagnostics: {
    id: string;
    title: string;
    displayValue?: string;
    score?: number | null;
  }[];
};

export type AccessibilitySummary = {
  violations: {
    id: string;
    impact: "minor" | "moderate" | "serious" | "critical" | null;
    description: string;
    help: string;
    nodes: {
      target: string[];
      html?: string;
      failureSummary?: string;
    }[];
  }[];
  violationCount: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
};

export type TechnicalAuditError = {
  error: {
    message: string;
    source: "lighthouse" | "accessibility";
    timestamp: string;
  };
};

type LighthouseReport = {
  finalDisplayedUrl?: string;
  finalUrl?: string;
  requestedUrl?: string;
  categories?: Record<string, { score?: number | null } | undefined>;
  audits?: Record<
    string,
    | {
        id?: string;
        title?: string;
        description?: string;
        score?: number | null;
        numericValue?: number | null;
        displayValue?: string;
        details?: {
          type?: string;
          overallSavingsMs?: number;
          overallSavingsBytes?: number;
        };
        group?: string;
      }
    | undefined
  >;
};

type AxeResult = {
  violations?: {
    id?: string;
    impact?: string | null;
    description?: string;
    help?: string;
    nodes?: {
      target?: string[];
      html?: string;
      failureSummary?: string;
    }[];
  }[];
};

export function normalizeLighthouseReport(report: unknown): LighthouseSummary {
  const lighthouseReport = report as LighthouseReport;
  const audits = lighthouseReport.audits ?? {};

  return {
    url: lighthouseReport.finalDisplayedUrl ?? lighthouseReport.finalUrl ?? lighthouseReport.requestedUrl ?? "",
    performance: scoreToPercent(lighthouseReport.categories?.performance?.score),
    accessibility: scoreToPercent(lighthouseReport.categories?.accessibility?.score),
    bestPractices: scoreToPercent(lighthouseReport.categories?.["best-practices"]?.score),
    seo: scoreToPercent(lighthouseReport.categories?.seo?.score),
    metrics: {
      firstContentfulPaint: numericAuditValue(audits["first-contentful-paint"]),
      largestContentfulPaint: numericAuditValue(audits["largest-contentful-paint"]),
      totalBlockingTime: numericAuditValue(audits["total-blocking-time"]),
      cumulativeLayoutShift: numericAuditValue(audits["cumulative-layout-shift"]),
      speedIndex: numericAuditValue(audits["speed-index"])
    },
    opportunities: Object.values(audits)
      .filter((audit) => audit?.details?.type === "opportunity")
      .map((audit) => ({
        id: audit?.id ?? "",
        title: audit?.title ?? "",
        description: audit?.description,
        score: audit?.score,
        numericValue: audit?.numericValue,
        displayValue: audit?.displayValue
      }))
      .filter((audit) => audit.id && audit.title)
      .sort((left, right) => (right.numericValue ?? 0) - (left.numericValue ?? 0))
      .slice(0, 15),
    diagnostics: Object.values(audits)
      .filter((audit) => audit?.details?.type === "diagnostic" || audit?.group === "diagnostics")
      .map((audit) => ({
        id: audit?.id ?? "",
        title: audit?.title ?? "",
        displayValue: audit?.displayValue,
        score: audit?.score
      }))
      .filter((audit) => audit.id && audit.title)
      .slice(0, 15)
  };
}

export function normalizeAccessibilityResult(result: unknown): AccessibilitySummary {
  const axeResult = result as AxeResult;
  const violations = (axeResult.violations ?? []).map((violation) => ({
    id: violation.id ?? "",
    impact: normalizeImpact(violation.impact),
    description: violation.description ?? "",
    help: violation.help ?? "",
    nodes: (violation.nodes ?? []).slice(0, 10).map((node) => ({
      target: node.target ?? [],
      html: node.html,
      failureSummary: node.failureSummary
    }))
  }));

  return {
    violations,
    violationCount: violations.length,
    criticalCount: countByImpact(violations, "critical"),
    seriousCount: countByImpact(violations, "serious"),
    moderateCount: countByImpact(violations, "moderate"),
    minorCount: countByImpact(violations, "minor")
  };
}

export function technicalAuditError(
  source: TechnicalAuditError["error"]["source"],
  error: unknown
): TechnicalAuditError {
  return {
    error: {
      source,
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }
  };
}

function scoreToPercent(score: number | null | undefined) {
  if (typeof score !== "number") {
    return null;
  }

  return Math.round(score * 100);
}

function numericAuditValue(audit: { numericValue?: number | null } | undefined) {
  return typeof audit?.numericValue === "number" ? audit.numericValue : undefined;
}

function normalizeImpact(impact: string | null | undefined): AccessibilitySummary["violations"][number]["impact"] {
  if (impact === "minor" || impact === "moderate" || impact === "serious" || impact === "critical") {
    return impact;
  }

  return null;
}

function countByImpact(
  violations: AccessibilitySummary["violations"],
  impact: NonNullable<AccessibilitySummary["violations"][number]["impact"]>
) {
  return violations.filter((violation) => violation.impact === impact).length;
}
