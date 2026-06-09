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

const worker = new Worker<AuditJobData>(
  AUDIT_QUEUE_NAME,
  async (job) => {
    const { auditProjectId } = job.data;
    logger.info("Audit worker started.", { auditProjectId, jobId: job.id });

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

    await prisma.auditProject.update({
      where: {
        id: auditProjectId
      },
      data: {
        status: AuditStatus.CRAWLING,
        errorMessage: null,
        siteProfile: Prisma.JsonNull
      }
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
    const savedPages: SavedAuditPage[] = [await saveCrawledPage(auditProjectId, homepage)];

    const discoveryPlan = createPageDiscoveryPlan({
      depth: project.depth,
      homepage: homepage.extracted,
      baseUrl: homepage.extracted.finalUrl
    });

    logger.info("Page discovery plan created.", {
      auditProjectId,
      discoveredLinkCount: discoveryPlan.discoveredLinks.length,
      candidateCount: discoveryPlan.candidates.length,
      depth: project.depth
    });

    for (const candidate of discoveryPlan.candidates) {
      if (savedPages.length >= env.CRAWLER_MAX_PAGES) {
        logger.warn("Crawler max page limit reached; remaining candidates skipped.", {
          auditProjectId,
          maxPages: env.CRAWLER_MAX_PAGES
        });
        break;
      }

      const savedPage = await crawlCandidatePage(auditProjectId, homepage.extracted.finalUrl, candidate);

      if (savedPage) {
        savedPages.push(savedPage);
      }
    }

    await prisma.auditProject.update({
      where: {
        id: auditProjectId
      },
      data: {
        status: AuditStatus.AUDITING
      }
    });
    await job.updateProgress({
      status: AuditStatus.AUDITING
    });

    for (const savedPage of savedPages) {
      await runTechnicalAuditsForPage(auditProjectId, savedPage);
    }

    if (project.competitors.length > 0) {
      await prisma.auditProject.update({
        where: {
          id: auditProjectId
        },
        data: {
          status: AuditStatus.COMPETITOR_ANALYSIS
        }
      });
      await job.updateProgress({
        status: AuditStatus.COMPETITOR_ANALYSIS
      });

      for (const competitor of project.competitors) {
        await analyzeCompetitor(auditProjectId, competitor);
      }
    }

    await createDeterministicReport(auditProjectId);

    await prisma.auditProject.update({
      where: {
        id: auditProjectId
      },
      data: {
        status: AuditStatus.AI_ANALYSIS
      }
    });
    await job.updateProgress({
      status: AuditStatus.AI_ANALYSIS
    });

    await runCoreAIAgents(auditProjectId);
    await runCompetitorComparison(auditProjectId);
    await runOpportunityGeneration(auditProjectId);
    await runFinalReportWriting(auditProjectId);

    await delay(env.AUDIT_STATUS_STEP_DELAY_MS);

    await prisma.auditProject.update({
      where: {
        id: auditProjectId
      },
      data: {
        status: AuditStatus.REPORT_READY,
        errorMessage: null
      }
    });
    await job.updateProgress({
      status: AuditStatus.REPORT_READY
    });

    logger.info("Audit worker finished.", { auditProjectId, jobId: job.id });
  },
  {
    connection: getRedisConnectionOptions(),
    concurrency: 2
  }
);

worker.on("failed", async (job, error) => {
  const auditProjectId = job?.data.auditProjectId;
  logger.error("Audit worker failed.", {
    auditProjectId,
    jobId: job?.id,
    error: error.message
  });

  if (auditProjectId) {
    await prisma.auditProject.update({
      where: {
        id: auditProjectId
      },
      data: {
        status: AuditStatus.FAILED,
        errorMessage: error.message
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

async function crawlCandidatePage(auditProjectId: string, baseUrl: string, candidate: DiscoveryCandidate) {
  try {
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

    return saveCrawledPage(auditProjectId, {
      ...crawledPage,
      pageType: finalClassification.pageType
    });
  } catch (error) {
    logger.warn("Skipping discovered page after crawl failure.", {
      auditProjectId,
      url: candidate.link.normalizedUrl,
      pageType: candidate.pageType,
      error: error instanceof Error ? error.message : error
    });
    return null;
  }
}

async function saveCrawledPage(auditProjectId: string, crawledPage: CrawledPage) {
  const detectorResults = runEcommerceDetectors({
    pageType: crawledPage.pageType,
    extracted: crawledPage.extracted
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
      domText: crawledPage.extracted.visibleText,
      headings: toJson(crawledPage.extracted.headings),
      links: toJson(crawledPage.extracted.links),
      buttons: toJson(crawledPage.extracted.buttons),
      forms: toJson(crawledPage.extracted.forms),
      consoleErrors: toJson(crawledPage.extracted.consoleErrors.slice(0, 100)),
      failedRequests: toJson(crawledPage.extracted.failedRequests.slice(0, 100)),
      detectorResults: toJson(detectorResults)
    }
  });

  return {
    id: auditPage.id,
    url: auditPage.url
  };
}

async function runTechnicalAuditsForPage(auditProjectId: string, page: SavedAuditPage) {
  logger.info("Technical audits started.", {
    auditProjectId,
    auditPageId: page.id,
    url: page.url
  });

  try {
    const { lighthouse, accessibility } = await runTechnicalAudits(page.url);

    await prisma.auditPage.update({
      where: {
        id: page.id
      },
      data: {
        lighthouse: toJson(lighthouse),
        accessibility: toJson(accessibility)
      }
    });

    logger.info("Technical audits finished.", {
      auditProjectId,
      auditPageId: page.id
    });
  } catch (error) {
    logger.warn("Technical audits could not be saved.", {
      auditProjectId,
      auditPageId: page.id,
      error: error instanceof Error ? error.message : error
    });
  }
}

async function analyzeCompetitor(auditProjectId: string, competitor: Competitor) {
  logger.info("Competitor analysis started.", {
    auditProjectId,
    competitorId: competitor.id,
    url: competitor.normalizedUrl
  });

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
    const crawledPage = await crawlPage({
      projectId: competitor.id,
      url: competitor.normalizedUrl,
      pageType: "home"
    });
    const savedPage = await saveCompetitorPage(competitor.id, crawledPage);
    const { lighthouse, accessibility } = await runTechnicalAudits(savedPage.url);

    await prisma.competitorPage.update({
      where: {
        id: savedPage.id
      },
      data: {
        lighthouse: toJson(lighthouse),
        accessibility: toJson(accessibility)
      }
    });

    logger.info("Competitor analysis finished.", {
      auditProjectId,
      competitorId: competitor.id
    });
  } catch (error) {
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
      competitorId: competitor.id,
      error: error instanceof Error ? error.message : error
    });
  }
}

async function saveCompetitorPage(competitorId: string, crawledPage: CrawledPage): Promise<SavedCompetitorPage> {
  const detectorResults = runEcommerceDetectors({
    pageType: "home",
    extracted: crawledPage.extracted
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
      domText: crawledPage.extracted.visibleText,
      headings: toJson(crawledPage.extracted.headings),
      links: toJson(crawledPage.extracted.links),
      buttons: toJson(crawledPage.extracted.buttons),
      forms: toJson(crawledPage.extracted.forms),
      detectorResults: toJson(detectorResults)
    }
  });

  return {
    id: competitorPage.id,
    url: competitorPage.url
  };
}

function runTechnicalAudits(url: string) {
  return Promise.all([runLighthouseAudit(url), runAccessibilityAudit(url)]).then(([lighthouse, accessibility]) => ({
    lighthouse,
    accessibility
  }));
}

async function createDeterministicReport(auditProjectId: string) {
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

  await prisma.auditReport.create({
    data: {
      projectId: auditProjectId,
      title: "Deterministic audit scorecard",
      executiveSummary: "Deterministic scorecard generated from crawler, detector, Lighthouse, accessibility, and competitor signals.",
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
    scorecard
  });
}

async function runCoreAIAgents(auditProjectId: string) {
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

      await prisma.auditProject.update({
        where: {
          id: auditProjectId
        },
        data: {
          siteProfile: toJson(siteProfile)
        }
      });
    } catch (error) {
      logger.warn("Site profile AI analysis failed; continuing with fallback report inputs.", {
        auditProjectId,
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

      await prisma.auditPage.update({
        where: {
          id: page.id
        },
        data: {
          aiAnalysis: toJson(aiAnalysis)
        }
      });
    } catch (error) {
      await prisma.auditPage.update({
        where: {
          id: page.id
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
        auditPageId: page.id,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  logger.info("Core AI agents finished.", {
    auditProjectId,
    pageCount: project.pages.length,
    provider: getEnv().OPENAI_API_KEY ? "openai-compatible" : "local-fallback"
  });
}

async function runCompetitorComparison(auditProjectId: string) {
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

  await prisma.auditReport.update({
    where: {
      id: report.id
    },
    data: {
      content: toJson({
        ...existingContent,
        competitorComparison
      })
    }
  });

  logger.info("Competitor comparison created.", {
    auditProjectId,
    competitorCount: project.competitors.length
  });
}

async function runOpportunityGeneration(auditProjectId: string) {
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

  await prisma.opportunity.createMany({
    data: generation.opportunities.map((opportunity) => toOpportunityCreateManyInput(auditProjectId, opportunity))
  });

  logger.info("Opportunities generated.", {
    auditProjectId,
    opportunityCount: generation.opportunities.length,
    quickWinCount: generation.opportunities.filter(isQuickWin).length,
    strategicProjectCount: generation.opportunities.filter(isStrategicProject).length
  });
}

async function runFinalReportWriting(auditProjectId: string) {
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

  await prisma.auditReport.update({
    where: {
      id: report.id
    },
    data: {
      title: "AI Commerce Audit Report",
      executiveSummary: finalReport.executiveSummary,
      scorecard: toJson(finalReport.scorecard),
      content: toJson({
        ...existingContent,
        finalReport
      }),
      markdown
    }
  });

  logger.info("Final report written.", {
    auditProjectId,
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
