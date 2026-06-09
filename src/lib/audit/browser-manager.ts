import { chromium } from "playwright";
import type { Browser, BrowserContext } from "playwright";

export type ViewportKind = "desktop" | "mobile";

const viewportConfig: Record<ViewportKind, { width: number; height: number; isMobile?: boolean; deviceScaleFactor?: number }> = {
  desktop: {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1
  },
  mobile: {
    width: 390,
    height: 844,
    isMobile: true,
    deviceScaleFactor: 2
  }
};

export async function launchAuditBrowser() {
  return chromium.launch({
    headless: true
  });
}

export async function createAuditContext(browser: Browser, viewport: ViewportKind): Promise<BrowserContext> {
  return browser.newContext({
    viewport: {
      width: viewportConfig[viewport].width,
      height: viewportConfig[viewport].height
    },
    isMobile: viewportConfig[viewport].isMobile ?? false,
    deviceScaleFactor: viewportConfig[viewport].deviceScaleFactor ?? 1,
    userAgent:
      viewport === "mobile"
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : undefined,
    ignoreHTTPSErrors: true,
    javaScriptEnabled: true,
    serviceWorkers: "block",
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "reduce",
    colorScheme: "light",
    acceptDownloads: false,
    forcedColors: "none",
    screen: {
      width: viewportConfig[viewport].width,
      height: viewportConfig[viewport].height
    }
  });
}
