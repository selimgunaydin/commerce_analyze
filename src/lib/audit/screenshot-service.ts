import type { Page } from "playwright";
import { getEnv } from "@/src/lib/config/env";
import { getLocalStorageProvider } from "@/src/lib/storage/local-storage-provider";
import type { StorageProvider } from "@/src/lib/storage/storage-provider";
import type { PageType } from "./types";

export async function captureFullPageScreenshot(params: {
  page: Page;
  projectId: string;
  pageType: PageType;
  viewport: "desktop" | "mobile";
  storageProvider?: StorageProvider;
}) {
  const env = getEnv();
  const screenshot = await captureWithSizeLimit(params.page, env.SCREENSHOT_MAX_BYTES);

  const storageProvider = params.storageProvider ?? getLocalStorageProvider();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  return storageProvider.saveBuffer({
    buffer: screenshot.buffer,
    path: `audits/${params.projectId}/${params.pageType}-${params.viewport}-${timestamp}.${screenshot.extension}`,
    contentType: screenshot.contentType
  });
}

async function captureWithSizeLimit(page: Page, maxBytes: number) {
  const png = await page.screenshot({
    fullPage: true,
    type: "png",
    animations: "disabled"
  });

  if (png.byteLength <= maxBytes) {
    return {
      buffer: png,
      extension: "png",
      contentType: "image/png"
    };
  }

  const fullPageJpeg = await page.screenshot({
    fullPage: true,
    type: "jpeg",
    quality: 72,
    animations: "disabled"
  });

  if (fullPageJpeg.byteLength <= maxBytes) {
    return {
      buffer: fullPageJpeg,
      extension: "jpg",
      contentType: "image/jpeg"
    };
  }

  const viewportJpeg = await page.screenshot({
    fullPage: false,
    type: "jpeg",
    quality: 70,
    animations: "disabled"
  });

  if (viewportJpeg.byteLength <= maxBytes) {
    return {
      buffer: viewportJpeg,
      extension: "jpg",
      contentType: "image/jpeg"
    };
  }

  throw new Error(`Screenshot exceeds maximum size of ${maxBytes} bytes.`);
}
