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
import { calculateAuditScorecard } from "@/src/lib/audit/scoring";

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
        errorMessage: null
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
        competitorCount: project.competitors.length
      })
    }
  });

  logger.info("Deterministic scorecard created.", {
    auditProjectId,
    scorecard
  });
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
