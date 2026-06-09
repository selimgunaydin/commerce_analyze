import { AuditStatus, Prisma, type Competitor } from "@prisma/client";
import { Worker } from "bullmq";
import { getEnv } from "@/src/lib/config/env";
import { prisma } from "@/src/lib/db/prisma";
import { AUDIT_QUEUE_NAME, getRedisConnectionOptions } from "@/src/lib/queue/audit-queue";
import { logger } from "@/src/lib/logger/logger";
import { crawlHomepage, crawlPage, type CrawledPage } from "@/src/lib/audit/crawler";
import { createPageDiscoveryPlan, type DiscoveryCandidate } from "@/src/lib/audit/page-discovery";
import { classifyExtractedPage } from "@/src/lib/audit/page-classifier";
import { isInternalUrl } from "@/src/lib/utils/url-normalizer";
import { runEcommerceDetectors } from "@/src/lib/audit/ecommerce-detectors";
import { runAccessibilityAudit } from "@/src/lib/audit/accessibility-runner";
import { runLighthouseAudit } from "@/src/lib/audit/lighthouse-runner";
import { technicalAuditError } from "@/src/lib/audit/technical-audit-normalizer";
import type { ExtractedPageData } from "@/src/lib/audit/types";
import { calculateAuditScorecard, calculatePageScorecard } from "@/src/lib/audit/scoring";
import { getDefaultAIProvider, LocalStructuredFallbackProvider, type AIProvider } from "@/src/lib/ai/provider";
import { runSiteProfilerAgent } from "@/src/lib/ai/agents/site-profiler-agent";
import { runPageUXAnalyzerAgent } from "@/src/lib/ai/agents/page-ux-analyzer-agent";
import { runCompetitorComparisonAgent } from "@/src/lib/ai/agents/competitor-comparison-agent";
import { runOpportunityGeneratorAgent } from "@/src/lib/ai/agents/opportunity-generator-agent";
import { runReportWriterAgent } from "@/src/lib/ai/agents/report-writer-agent";
import type { AuditOpportunity } from "@/src/lib/ai/schemas";
import {
  buildFinalAuditReportDraft,
  buildMarkdownReport,
  preserveStoredOpportunities
} from "@/src/lib/report/report-builder";
import { cleanupAuditStorage } from "@/src/lib/storage/storage-cleanup";

type AuditJobData = {
  auditProjectId: string;
  runId: string;
};

type SavedAuditPage = {
  id: string;
  url: string;
};

type SavedCompetitorPage = {
  id: string;
  url: string;
};

const env = getEnv();

class StaleAuditRunError extends Error {
  constructor(auditProjectId: string, runId: string) {
    super(`Stale audit run skipped: ${auditProjectId} / ${runId}`);
    this.name = "StaleAuditRunError";
  }
}

const worker = new Worker<AuditJobData>(
  AUDIT_QUEUE_NAME,
  async (job) => {
    const { auditProjectId, runId } = job.data;
    logger.info("Audit worker started.", { auditProjectId, runId, jobId: job.id });

    try {
      if (!runId) {
        throw new Error(`Audit job is missing runId: ${auditProjectId}`);
      }

      const project = await prisma.auditProject.findUnique({
        where: {
          id: auditProjectId
        },
        include: {
          competitors: true
        }
      });

      if (!project) {
        throw new Error(`Audit project not found: ${auditProjectId}`);
      }

      if (project.activeRunId !== runId) {
        logger.warn("Skipping stale audit worker before any writes.", {
          auditProjectId,
          runId,
          activeRunId: project.activeRunId,
          jobId: job.id
        });
        return;
      }

      await updateProjectForRun(auditProjectId, runId, {
        status: AuditStatus.CRAWLING,
        errorMessage: null,
        siteProfile: Prisma.JsonNull
      });
      await job.updateProgress({
        status: AuditStatus.CRAWLING
      });

      await prisma.auditPage.deleteMany({
        where: {
          projectId: auditProjectId
        }
      });
      await prisma.auditReport.deleteMany({
        where: {
          projectId: auditProjectId
        }
      });
      await prisma.opportunity.deleteMany({
        where: {
          projectId: auditProjectId
        }
      });
      await cleanupAuditStorage(auditProjectId);

      const homepage = await crawlHomepage(project);
      const savedPages: SavedAuditPage[] = [await saveCrawledPage(auditProjectId, runId, homepage)];

      const discoveryPlan = createPageDiscoveryPlan({
        depth: project.depth,
        homepage: homepage.extracted,
        baseUrl: homepage.extracted.finalUrl
      });

      logger.info("Page discovery plan created.", {
        auditProjectId,
        runId,
        discoveredLinkCount: discoveryPlan.discoveredLinks.length,
        candidateCount: discoveryPlan.candidates.length,
        depth: project.depth
      });

      for (const candidate of discoveryPlan.candidates) {
        if (savedPages.length >= env.CRAWLER_MAX_PAGES) {
          logger.warn("Crawler max page limit reached; remaining candidates skipped.", {
            auditProjectId,
            runId,
            maxPages: env.CRAWLER_MAX_PAGES
          });
          break;
        }

        const savedPage = await crawlCandidatePage(auditProjectId, runId, homepage.extracted.finalUrl, candidate);

        if (savedPage) {
          savedPages.push(savedPage);
        }
      }

      await updateProjectForRun(auditProjectId, runId, {
        status: AuditStatus.AUDITING
      });
      await job.updateProgress({
        status: AuditStatus.AUDITING
      });

      for (const savedPage of savedPages) {
        await runTechnicalAuditsForPage(auditProjectId, runId, savedPage);
      }

      if (project.competitors.length > 0) {
        await updateProjectForRun(auditProjectId, runId, {
          status: AuditStatus.COMPETITOR_ANALYSIS
        });
        await job.updateProgress({
          status: AuditStatus.COMPETITOR_ANALYSIS
        });

        for (const competitor of project.competitors) {
          await analyzeCompetitor(auditProjectId, runId, competitor);
        }
      }

      await createDeterministicReport(auditProjectId, runId);

      await updateProjectForRun(auditProjectId, runId, {
        status: AuditStatus.AI_ANALYSIS
      });
      await job.updateProgress({
        status: AuditStatus.AI_ANALYSIS
      });

      await runCoreAIAgents(auditProjectId, runId);
      await runCompetitorComparison(auditProjectId, runId);
      await runOpportunityGeneration(auditProjectId, runId);
      await runFinalReportWriting(auditProjectId, runId);

      await delay(env.AUDIT_STATUS_STEP_DELAY_MS);

      await updateProjectForRun(auditProjectId, runId, {
        status: AuditStatus.REPORT_READY,
        errorMessage: null,
        activeRunId: null
      });
      await job.updateProgress({
        status: AuditStatus.REPORT_READY
      });

      logger.info("Audit worker finished.", { auditProjectId, runId, jobId: job.id });
    } catch (error) {
      if (error instanceof StaleAuditRunError) {
        logger.warn("Stale audit worker stopped without changing project status.", {
          auditProjectId,
          runId,
          jobId: job.id
        });
        return;
      }

      throw error;
    }
  },
  {
    connection: getRedisConnectionOptions(),
    concurrency: 1
  }
);

worker.on("failed", async (job, error) => {
  const auditProjectId = job?.data.auditProjectId;
  const runId = job?.data.runId;
  logger.error("Audit worker failed.", {
    auditProjectId,
    runId,
    jobId: job?.id,
    error: error.message
  });

  if (auditProjectId && runId) {
    await prisma.auditProject.updateMany({
      where: {
        id: auditProjectId,
        activeRunId: runId
      },
      data: {
        status: AuditStatus.FAILED,
        errorMessage: error.message,
        activeRunId: null
      }
    });
  }
});

logger.info("Audit worker listening.", {
  queue: AUDIT_QUEUE_NAME
});

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateProjectForRun(auditProjectId: string, runId: string, data: Prisma.AuditProjectUpdateManyMutationInput) {
  const result = await prisma.auditProject.updateMany({
    where: {
      id: auditProjectId,
      activeRunId: runId
    },
    data
  });

  if (result.count === 0) {
    throw new StaleAuditRunError(auditProjectId, runId);
  }
}

async function ensureActiveRun(auditProjectId: string, runId: string) {
  const project = await prisma.auditProject.findUnique({
    where: {
      id: auditProjectId
    },
    select: {
      activeRunId: true
    }
  });

  if (!project || project.activeRunId !== runId) {
    throw new StaleAuditRunError(auditProjectId, runId);
  }
}

async function crawlCandidatePage(auditProjectId: string, runId: string, baseUrl: string, candidate: DiscoveryCandidate) {
  try {
    await ensureActiveRun(auditProjectId, runId);
    const crawledPage = await crawlPage({
      projectId: auditProjectId,
      url: candidate.link.normalizedUrl,
      pageType: candidate.pageType
    });

    if (!isInternalUrl(crawledPage.extracted.finalUrl, baseUrl)) {
      logger.warn("Skipping discovered page after external redirect.", {
        auditProjectId,
        originalUrl: candidate.link.normalizedUrl,
        finalUrl: crawledPage.extracted.finalUrl
      });
      return null;
    }

    const finalClassification = classifyExtractedPage({
      extracted: crawledPage.extracted,
      link: candidate.link,
      fallbackPageType: candidate.pageType
    });

    return saveCrawledPage(auditProjectId, runId, {
      ...crawledPage,
      pageType: finalClassification.pageType
    });
  } catch (error) {
    if (error instanceof StaleAuditRunError) {
      throw error;
    }

    logger.warn("Skipping discovered page after crawl failure.", {
      auditProjectId,
      runId,
      url: candidate.link.normalizedUrl,
      pageType: candidate.pageType,
      error: error instanceof Error ? error.message : error
    });
    return null;
  }
}

async function saveCrawledPage(auditProjectId: string, runId: string, crawledPage: CrawledPage) {
  await ensureActiveRun(auditProjectId, runId);

  const compacted = compactCrawledPageData(crawledPage.extracted);
  const detectorResults = runEcommerceDetectors({
    pageType: crawledPage.pageType,
    extracted: {
      ...crawledPage.extracted,
      consoleErrors: compacted.consoleErrors,
      failedRequests: compacted.failedRequests
    }
  });

  const auditPage = await prisma.auditPage.create({
    data: {
      projectId: auditProjectId,
      url: crawledPage.extracted.finalUrl,
      pageType: crawledPage.pageType,
      title: crawledPage.extracted.title,
      metaDescription: crawledPage.extracted.metaDescription,
      screenshotPath: crawledPage.screenshotPath,
      mobileScreenshotPath: crawledPage.mobileScreenshotPath,
      domText: compacted.visibleText,
      headings: toJson(compacted.headings),
      links: toJson(compacted.links),
      buttons: toJson(compacted.buttons),
      forms: toJson(compacted.forms),
      consoleErrors: toJson(compacted.consoleErrors),
      failedRequests: toJson(compacted.failedRequests),
      detectorResults: toJson(detectorResults)
    }
  });

  return {
    id: auditPage.id,
    url: auditPage.url
  };
}

async function runTechnicalAuditsForPage(auditProjectId: string, runId: string, page: SavedAuditPage) {
  logger.info("Technical audits started.", {
    auditProjectId,
    runId,
    auditPageId: page.id,
    url: page.url
  });

  try {
    const { lighthouse, accessibility } = await runTechnicalAudits(page.url);

    await ensureActiveRun(auditProjectId, runId);
    const update = await prisma.auditPage.updateMany({
      where: {
        id: page.id,
        projectId: auditProjectId
      },
      data: {
        lighthouse: toJson(lighthouse),
        accessibility: toJson(accessibility)
      }
    });

    if (update.count === 0) {
      logger.warn("Technical audit result ignored because page no longer exists.", {
        auditProjectId,
        runId,
        auditPageId: page.id
      });
      return;
    }

    logger.info("Technical audits finished.", {
      auditProjectId,
      runId,
      auditPageId: page.id
    });
  } catch (error) {
    if (error instanceof StaleAuditRunError) {
      throw error;
    }

    logger.warn("Technical audits could not be saved.", {
      auditProjectId,
      runId,
      auditPageId: page.id,
      error: error instanceof Error ? error.message : error
    });
  }
}

async function analyzeCompetitor(auditProjectId: string, runId: string, competitor: Competitor) {
  logger.info("Competitor analysis started.", {
    auditProjectId,
    runId,
    competitorId: competitor.id,
    url: competitor.normalizedUrl
  });

  await ensureActiveRun(auditProjectId, runId);
  await prisma.competitorPage.deleteMany({
    where: {
      competitorId: competitor.id
    }
  });
  await cleanupAuditStorage(competitor.id);

  await prisma.competitor.update({
    where: {
      id: competitor.id
    },
    data: {
      errorMessage: null
    }
  });

  try {
    await ensureActiveRun(auditProjectId, runId);
    const crawledPage = await crawlPage({
      projectId: competitor.id,
      url: competitor.normalizedUrl,
      pageType: "home"
    });
    const savedPage = await saveCompetitorPage(competitor.id, crawledPage);
    const { lighthouse, accessibility } = await runTechnicalAudits(savedPage.url);

    await ensureActiveRun(auditProjectId, runId);
    await prisma.competitorPage.updateMany({
      where: {
        id: savedPage.id,
        competitorId: competitor.id
      },
      data: {
        lighthouse: toJson(lighthouse),
        accessibility: toJson(accessibility)
      }
    });

    logger.info("Competitor analysis finished.", {
      auditProjectId,
      runId,
      competitorId: competitor.id
    });
  } catch (error) {
    if (error instanceof StaleAuditRunError) {
      throw error;
    }

    await prisma.competitor.update({
      where: {
        id: competitor.id
      },
      data: {
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    });

    logger.warn("Competitor analysis failed.", {
      auditProjectId,
      runId,
      competitorId: competitor.id,
      error: error instanceof Error ? error.message : error
    });
  }
}

async function saveCompetitorPage(competitorId: string, crawledPage: CrawledPage): Promise<SavedCompetitorPage> {
  const compacted = compactCrawledPageData(crawledPage.extracted);
  const detectorResults = runEcommerceDetectors({
    pageType: "home",
    extracted: {
      ...crawledPage.extracted,
      consoleErrors: compacted.consoleErrors,
      failedRequests: compacted.failedRequests
    }
  });

  const competitorPage = await prisma.competitorPage.create({
    data: {
      competitorId,
      url: crawledPage.extracted.finalUrl,
      pageType: "home",
      title: crawledPage.extracted.title,
      metaDescription: crawledPage.extracted.metaDescription,
      screenshotPath: crawledPage.screenshotPath,
      mobileScreenshotPath: crawledPage.mobileScreenshotPath,
      domText: compacted.visibleText,
      headings: toJson(compacted.headings),
      links: toJson(compacted.links),
      buttons: toJson(compacted.buttons),
      forms: toJson(compacted.forms),
      detectorResults: toJson(detectorResults)
    }
  });

  return {
    id: competitorPage.id,
    url: competitorPage.url
  };
}

async function runTechnicalAudits(url: string) {
  const [lighthouse, accessibility] = await Promise.allSettled([runLighthouseAudit(url), runAccessibilityAudit(url)]);

  return {
    lighthouse: lighthouse.status === "fulfilled" ? lighthouse.value : technicalAuditError("lighthouse", lighthouse.reason),
    accessibility: accessibility.status === "fulfilled" ? accessibility.value : technicalAuditError("accessibility", accessibility.reason)
  };
}

function compactCrawledPageData(extracted: ExtractedPageData) {
  return {
    visibleText: truncateText(extracted.visibleText, 12_000),
    headings: {
      h1: compactStringArray(extracted.headings.h1, 20, 180),
      h2: compactStringArray(extracted.headings.h2, 40, 180),
      h3: compactStringArray(extracted.headings.h3, 40, 180)
    },
    links: dedupeBy(
      extracted.links
        .filter((link) => link.href || link.text.trim())
        .map((link) => ({
          text: truncateText(link.text, 140),
          href: stripUrlNoise(link.href)
        })),
      (link) => `${link.text}|${link.href}`
    ).slice(0, 120),
    buttons: dedupeBy(
      extracted.buttons.map((button) => ({
        text: truncateText(button.text, 140),
        type: button.type,
        ariaLabel: button.ariaLabel ? truncateText(button.ariaLabel, 140) : undefined
      })),
      (button) => `${button.text}|${button.type ?? ""}|${button.ariaLabel ?? ""}`
    ).slice(0, 80),
    forms: extracted.forms
      .map((form) => ({
        action: form.action ? stripUrlNoise(form.action) : undefined,
        method: form.method,
        fields: form.fields.slice(0, 30).map((field) => ({
          name: field.name ? truncateText(field.name, 80) : undefined,
          type: field.type ? truncateText(field.type, 40) : undefined,
          placeholder: field.placeholder ? truncateText(field.placeholder, 120) : undefined,
          label: field.label ? truncateText(field.label, 120) : undefined
        }))
      }))
      .slice(0, 20),
    consoleErrors: compactConsoleErrors(extracted.consoleErrors),
    failedRequests: compactFailedRequests(extracted.failedRequests)
  };
}

function compactConsoleErrors(errors: string[]) {
  return dedupeBy(
    errors
      .filter((error) => !isNoisyConsoleError(error))
      .map((error) => truncateText(error.replace(/\s+/g, " ").trim(), 260))
      .filter(Boolean),
    (error) => error
  ).slice(0, 20);
}

function compactFailedRequests(requests: ExtractedPageData["failedRequests"]) {
  return dedupeBy(
    requests
      .filter((request) => !isNoisyFailedRequest(request))
      .map((request) => ({
        url: stripUrlNoise(request.url),
        status: request.status,
        errorText: request.errorText ? truncateText(request.errorText, 80) : undefined
      })),
    (request) => `${request.status ?? ""}|${request.errorText ?? ""}|${request.url}`
  ).slice(0, 20);
}

function isNoisyConsoleError(error: string) {
  const normalized = error.toLowerCase();

  return (
    normalized.includes("x-commerce-audit") ||
    normalized === "failed to load resource: net::err_failed" ||
    normalized === "failed to load resource: net::err_aborted"
  );
}

function isNoisyFailedRequest(request: ExtractedPageData["failedRequests"][number]) {
  const hostname = getHostname(request.url);
  const errorText = request.errorText?.toLowerCase() ?? "";

  if (request.status && request.status >= 400 && !isNoisyThirdPartyHost(hostname)) {
    return false;
  }

  return isNoisyThirdPartyHost(hostname) && (errorText.includes("err_aborted") || errorText.includes("err_failed") || isTrackingUrl(request.url));
}

function isNoisyThirdPartyHost(hostname: string) {
  return [
    "analytics.google.com",
    "www.google.com",
    "www.googleadservices.com",
    "googleads.g.doubleclick.net",
    "www.googletagmanager.com",
    "static.cloudflareinsights.com",
    "fonts.gstatic.com",
    "connect.facebook.net",
    "www.facebook.com"
  ].some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

function isTrackingUrl(url: string) {
  return /\/(?:collect|rmkt|ccm|g\/collect)(?:[/?]|$)/.test(url);
}

function stripUrlNoise(value: string) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return truncateText(url.toString(), 260);
  } catch {
    return truncateText(value, 260);
  }
}

function getHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function compactStringArray(values: string[], count: number, maxLength: number) {
  return values.map((value) => truncateText(value, maxLength)).filter(Boolean).slice(0, count);
}

function truncateText(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function dedupeBy<T>(values: T[], getKey: (value: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    const key = getKey(value);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

async function createDeterministicReport(auditProjectId: string, runId: string) {
  await ensureActiveRun(auditProjectId, runId);
  const project = await prisma.auditProject.findUnique({
    where: {
      id: auditProjectId
    },
    include: {
      pages: true,
      competitors: {
        include: {
          pages: true
        }
      }
    }
  });

  if (!project) {
    throw new Error(`Audit project not found for scoring: ${auditProjectId}`);
  }

  const scorecard = calculateAuditScorecard({
    pages: project.pages,
    competitors: project.competitors.map((competitor) => ({
      pages: competitor.pages
    }))
  });
  const pageScores = project.pages.map((page) => ({
    pageId: page.id,
    url: page.url,
    ...calculatePageScorecard(page)
  }));

  await prisma.auditReport.deleteMany({
    where: {
      projectId: auditProjectId
    }
  });

  await ensureActiveRun(auditProjectId, runId);
  await prisma.auditReport.create({
    data: {
      projectId: auditProjectId,
      title: "Deterministik audit skor kartı",
      executiveSummary: "Crawler, detector, Lighthouse, erişilebilirlik ve rakip sinyallerinden deterministik skor kartı üretildi.",
      scorecard: toJson(scorecard),
      content: toJson({
        source: "deterministic-scoring-v1",
        pageCount: project.pages.length,
        competitorCount: project.competitors.length,
        pageScores
      })
    }
  });

  logger.info("Deterministic scorecard created.", {
    auditProjectId,
    runId,
    scorecard
  });
}

async function runCoreAIAgents(auditProjectId: string, runId: string) {
  await ensureActiveRun(auditProjectId, runId);
  const project = await prisma.auditProject.findUnique({
    where: {
      id: auditProjectId
    },
    include: {
      pages: {
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  if (!project) {
    throw new Error(`Audit project not found for AI analysis: ${auditProjectId}`);
  }

  const provider = getDefaultAIProvider();
  const fallbackProvider = new LocalStructuredFallbackProvider();
  const homepage = project.pages.find((page) => page.pageType === "home") ?? project.pages[0];

  if (homepage) {
    try {
      const siteProfile = await withFallbackProvider({
        provider,
        fallbackProvider,
        run: (activeProvider) =>
          runSiteProfilerAgent({
            provider: activeProvider,
            project,
            homepage
          })
      });

      await updateProjectForRun(auditProjectId, runId, {
        siteProfile: toJson(siteProfile)
      });
    } catch (error) {
      if (error instanceof StaleAuditRunError) {
        throw error;
      }

      logger.warn("Site profile AI analysis failed; continuing with fallback report inputs.", {
        auditProjectId,
        runId,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  for (const page of project.pages) {
    try {
      const aiAnalysis = await withFallbackProvider({
        provider,
        fallbackProvider,
        run: (activeProvider) =>
          runPageUXAnalyzerAgent({
            provider: activeProvider,
            page
          })
      });

      await ensureActiveRun(auditProjectId, runId);
      await prisma.auditPage.updateMany({
        where: {
          id: page.id,
          projectId: auditProjectId
        },
        data: {
          aiAnalysis: toJson(aiAnalysis)
        }
      });
    } catch (error) {
      if (error instanceof StaleAuditRunError) {
        throw error;
      }

      await ensureActiveRun(auditProjectId, runId);
      await prisma.auditPage.updateMany({
        where: {
          id: page.id,
          projectId: auditProjectId
        },
        data: {
          aiAnalysis: toJson({
            error: {
              source: "page-ux-ai",
              message: error instanceof Error ? error.message : String(error)
            }
          })
        }
      });

      logger.warn("Page UX AI analysis failed; continuing audit.", {
        auditProjectId,
        runId,
        auditPageId: page.id,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  logger.info("Core AI agents finished.", {
    auditProjectId,
    runId,
    pageCount: project.pages.length,
    provider: getEnv().OPENAI_API_KEY ? "openai-compatible" : "local-fallback"
  });
}

async function runCompetitorComparison(auditProjectId: string, runId: string) {
  await ensureActiveRun(auditProjectId, runId);
  const project = await prisma.auditProject.findUnique({
    where: {
      id: auditProjectId
    },
    include: {
      pages: {
        orderBy: {
          createdAt: "asc"
        }
      },
      competitors: {
        include: {
          pages: {
            orderBy: {
              createdAt: "asc"
            }
          }
        }
      },
      reports: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  if (!project || project.competitors.length === 0) {
    return;
  }

  const homepage = project.pages.find((page) => page.pageType === "home") ?? project.pages[0];
  const report = project.reports[0] ?? null;

  if (!homepage || !report) {
    return;
  }

  const provider = getDefaultAIProvider();
  const fallbackProvider = new LocalStructuredFallbackProvider();
  const competitorComparison = await withFallbackProvider({
    provider,
    fallbackProvider,
    run: (activeProvider) =>
      runCompetitorComparisonAgent({
        provider: activeProvider,
        project,
        customerHomepage: homepage,
        report,
        competitors: project.competitors
      })
  });
  const existingContent = report.content && typeof report.content === "object" && !Array.isArray(report.content) ? report.content : {};

  await ensureActiveRun(auditProjectId, runId);
  const update = await prisma.auditReport.updateMany({
    where: {
      id: report.id,
      projectId: auditProjectId
    },
    data: {
      content: toJson({
        ...existingContent,
        competitorComparison
      })
    }
  });

  if (update.count === 0) {
    logger.warn("Competitor comparison ignored because report no longer exists.", {
      auditProjectId,
      runId,
      reportId: report.id
    });
    return;
  }

  logger.info("Competitor comparison created.", {
    auditProjectId,
    runId,
    competitorCount: project.competitors.length
  });
}

async function runOpportunityGeneration(auditProjectId: string, runId: string) {
  await ensureActiveRun(auditProjectId, runId);
  const project = await prisma.auditProject.findUnique({
    where: {
      id: auditProjectId
    },
    include: {
      pages: {
        orderBy: {
          createdAt: "asc"
        }
      },
      reports: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  if (!project || project.pages.length === 0) {
    return;
  }

  const report = project.reports[0] ?? null;

  if (!report) {
    return;
  }

  const provider = getDefaultAIProvider();
  const fallbackProvider = new LocalStructuredFallbackProvider();
  const generation = await withFallbackProvider({
    provider,
    fallbackProvider,
    run: (activeProvider) =>
      runOpportunityGeneratorAgent({
        provider: activeProvider,
        project,
        pages: project.pages,
        report
      })
  });

  await prisma.opportunity.deleteMany({
    where: {
      projectId: auditProjectId
    }
  });

  await ensureActiveRun(auditProjectId, runId);
  await prisma.opportunity.createMany({
    data: generation.opportunities.map((opportunity) => toOpportunityCreateManyInput(auditProjectId, opportunity))
  });

  logger.info("Opportunities generated.", {
    auditProjectId,
    runId,
    opportunityCount: generation.opportunities.length,
    quickWinCount: generation.opportunities.filter(isQuickWin).length,
    strategicProjectCount: generation.opportunities.filter(isStrategicProject).length
  });
}

async function runFinalReportWriting(auditProjectId: string, runId: string) {
  await ensureActiveRun(auditProjectId, runId);
  const project = await prisma.auditProject.findUnique({
    where: {
      id: auditProjectId
    },
    include: {
      pages: {
        orderBy: {
          createdAt: "asc"
        }
      },
      competitors: {
        include: {
          pages: {
            orderBy: {
              createdAt: "asc"
            }
          }
        }
      },
      opportunities: {
        orderBy: {
          createdAt: "asc"
        }
      },
      reports: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  if (!project) {
    throw new Error(`Audit project not found for final report writing: ${auditProjectId}`);
  }

  const report = project.reports[0] ?? null;

  if (!report) {
    return;
  }

  const draft = buildFinalAuditReportDraft({
    project,
    report
  });
  const provider = getDefaultAIProvider();
  const fallbackProvider = new LocalStructuredFallbackProvider();
  const generatedReport = await withFallbackProvider({
    provider,
    fallbackProvider,
    run: (activeProvider) =>
      runReportWriterAgent({
        provider: activeProvider,
        finalReportDraft: draft
      })
  });
  const finalReport = preserveStoredOpportunities(generatedReport, project.opportunities);
  const markdown = buildMarkdownReport(finalReport);
  const existingContent = report.content && typeof report.content === "object" && !Array.isArray(report.content) ? report.content : {};

  await ensureActiveRun(auditProjectId, runId);
  const update = await prisma.auditReport.updateMany({
    where: {
      id: report.id,
      projectId: auditProjectId
    },
    data: {
      title: "AI Commerce Audit Raporu",
      executiveSummary: finalReport.executiveSummary,
      scorecard: toJson(finalReport.scorecard),
      content: toJson({
        ...existingContent,
        finalReport
      }),
      markdown
    }
  });

  if (update.count === 0) {
    logger.warn("Final report ignored because report no longer exists.", {
      auditProjectId,
      runId,
      reportId: report.id
    });
    return;
  }

  logger.info("Final report written.", {
    auditProjectId,
    runId,
    opportunityCount: finalReport.opportunities.length,
    quickWinCount: finalReport.quickWins.length,
    strategicProjectCount: finalReport.strategicProjects.length
  });
}

function toOpportunityCreateManyInput(projectId: string, opportunity: AuditOpportunity) {
  return {
    projectId,
    title: opportunity.title,
    description: opportunity.description,
    category: opportunity.category,
    priority: opportunity.priority,
    estimatedEffort: opportunity.estimatedEffort,
    expectedImpact: opportunity.expectedImpact,
    implementationComplexity: opportunity.implementationComplexity,
    evidence: toJson(opportunity.evidence),
    affectedPages: toJson(opportunity.affectedPages),
    acceptanceCriteria: toJson(opportunity.acceptanceCriteria),
    suggestedImplementation: opportunity.suggestedImplementation,
    ...(opportunity.relatedCompetitorExamples.length > 0
      ? {
          relatedCompetitorExamples: toJson(opportunity.relatedCompetitorExamples)
        }
      : {})
  };
}

function isQuickWin(opportunity: AuditOpportunity) {
  return (
    (opportunity.estimatedEffort === "half_day" || opportunity.estimatedEffort === "1_day") &&
    (opportunity.expectedImpact === "medium" || opportunity.expectedImpact === "high") &&
    (opportunity.implementationComplexity === "low" || opportunity.implementationComplexity === "medium")
  );
}

function isStrategicProject(opportunity: AuditOpportunity) {
  return (
    (opportunity.estimatedEffort === "1_week" || opportunity.estimatedEffort === "2_weeks_plus") &&
    opportunity.expectedImpact === "high" &&
    (opportunity.implementationComplexity === "medium" || opportunity.implementationComplexity === "high")
  );
}

async function withFallbackProvider<T>(params: {
  provider: AIProvider;
  fallbackProvider: AIProvider;
  run: (provider: AIProvider) => Promise<T>;
}) {
  try {
    return await params.run(params.provider);
  } catch (error) {
    logger.warn("AI provider failed; using local structured fallback.", {
      error: error instanceof Error ? error.message : error
    });

    return params.run(params.fallbackProvider);
  }
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
