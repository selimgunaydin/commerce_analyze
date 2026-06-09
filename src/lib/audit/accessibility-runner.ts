import AxeBuilder from "@axe-core/playwright";
import { getEnv } from "@/src/lib/config/env";
import { createAuditContext, launchAuditBrowser } from "./browser-manager";
import {
  normalizeAccessibilityResult,
  technicalAuditError,
  type AccessibilitySummary,
  type TechnicalAuditError
} from "./technical-audit-normalizer";

export type AccessibilityAuditResult = AccessibilitySummary | TechnicalAuditError;

export async function runAccessibilityAudit(url: string): Promise<AccessibilityAuditResult> {
  const browser = await launchAuditBrowser();
  const timeoutMs = getEnv().ACCESSIBILITY_TIMEOUT_MS;

  try {
    const context = await createAuditContext(browser, "desktop");

    try {
      const page = await context.newPage();

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs
      });
      await page
        .waitForLoadState("networkidle", {
          timeout: Math.min(timeoutMs, 10_000)
        })
        .catch(() => undefined);

      const result = await withTimeout(new AxeBuilder({ page }).analyze(), timeoutMs, "Accessibility audit");
      return normalizeAccessibilityResult(result);
    } finally {
      await context.close();
    }
  } catch (error) {
    return technicalAuditError("accessibility", error);
  } finally {
    await browser.close();
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}
