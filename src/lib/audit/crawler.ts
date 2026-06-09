import type { AuditProject } from "@prisma/client";
import type { Page } from "playwright";
import { logger } from "@/src/lib/logger/logger";
import { validateAndNormalizeUrl } from "@/src/lib/utils/url-validation";
import { createAuditContext, launchAuditBrowser } from "./browser-manager";
import { extractPageData } from "./page-extractor";
import { captureFullPageScreenshot } from "./screenshot-service";
import type { ExtractedPageData, PageType } from "./types";
import { getEnv } from "@/src/lib/config/env";

export type CrawledPage = {
  pageType: PageType;
  extracted: ExtractedPageData;
  screenshotPath?: string;
  screenshotUrl?: string;
  mobileScreenshotPath?: string;
  mobileScreenshotUrl?: string;
};

export async function crawlHomepage(project: AuditProject): Promise<CrawledPage> {
  return crawlPage({
    projectId: project.id,
    url: project.normalizedUrl,
    pageType: "home"
  });
}

export async function crawlPage(params: {
  projectId: string;
  url: string;
  pageType: PageType;
}): Promise<CrawledPage> {
  const browser = await launchAuditBrowser();
  const env = getEnv();

  try {
    const desktopContext = await createAuditContext(browser, "desktop");
    const mobileContext = await createAuditContext(browser, "mobile");

    try {
      const desktopPage = await desktopContext.newPage();
      const telemetry = attachTelemetry(desktopPage);

      const mainResponse = await desktopPage.goto(params.url, {
        waitUntil: "domcontentloaded",
        timeout: env.CRAWLER_TIMEOUT_MS
      });
      await desktopPage.waitForLoadState("networkidle", {
        timeout: Math.min(env.CRAWLER_TIMEOUT_MS, 10_000)
      }).catch(() => undefined);
      await preparePageForAudit(desktopPage);

      const finalUrl = desktopPage.url();
      await validateAndNormalizeUrl(finalUrl);
      assertRedirectLimit(mainResponse, env.CRAWLER_MAX_REDIRECTS);

      const extracted = await extractPageData(desktopPage, telemetry);
      const desktopScreenshot = await captureFullPageScreenshot({
        page: desktopPage,
        projectId: params.projectId,
        pageType: params.pageType,
        viewport: "desktop"
      });

      const mobilePage = await mobileContext.newPage();

      await mobilePage.goto(finalUrl, {
        waitUntil: "domcontentloaded",
        timeout: env.CRAWLER_TIMEOUT_MS
      });
      await mobilePage.waitForLoadState("networkidle", {
        timeout: Math.min(env.CRAWLER_TIMEOUT_MS, 10_000)
      }).catch(() => undefined);
      await preparePageForAudit(mobilePage);

      const mobileScreenshot = await captureFullPageScreenshot({
        page: mobilePage,
        projectId: params.projectId,
        pageType: params.pageType,
        viewport: "mobile"
      });

      return {
        pageType: params.pageType,
        extracted: {
          ...extracted,
          finalUrl
        },
        screenshotPath: desktopScreenshot.path,
        screenshotUrl: desktopScreenshot.url,
        mobileScreenshotPath: mobileScreenshot.path,
        mobileScreenshotUrl: mobileScreenshot.url
      };
    } finally {
      await desktopContext.close();
      await mobileContext.close();
    }
  } catch (error) {
    logger.error("Page crawl failed.", {
      projectId: params.projectId,
      url: params.url,
      pageType: params.pageType,
      error: error instanceof Error ? error.message : error
    });
    throw error;
  } finally {
    await browser.close();
  }
}

async function preparePageForAudit(page: Page) {
  await page.evaluate(async () => {
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const maxScrollY = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight
    );
    const step = Math.max(window.innerHeight * 0.8, 500);

    for (let y = 0; y < maxScrollY; y += step) {
      window.scrollTo(0, y);
      await wait(80);
    }

    window.scrollTo(0, maxScrollY);
    await wait(150);
    window.scrollTo(0, 0);
    await wait(120);
  }).catch(() => undefined);

  await page.waitForLoadState("networkidle", {
    timeout: 5_000
  }).catch(() => undefined);
}

function attachTelemetry(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: ExtractedPageData["failedRequests"] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      errorText: request.failure()?.errorText
    });
  });

  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedRequests.push({
        url: response.url(),
        status: response.status()
      });
    }
  });

  return {
    consoleErrors,
    failedRequests
  };
}

function assertRedirectLimit(response: Awaited<ReturnType<Page["goto"]>>, maxRedirects: number) {
  if (!response) {
    return;
  }

  let redirects = 0;
  let request = response.request();

  while (request.redirectedFrom()) {
    redirects += 1;
    request = request.redirectedFrom()!;
  }

  if (redirects > maxRedirects) {
    throw new Error(`Too many redirects: ${redirects}. Max allowed redirects: ${maxRedirects}.`);
  }
}
