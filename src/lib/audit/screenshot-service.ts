import type { Page } from "playwright";
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
  const buffer = await params.page.screenshot({
    fullPage: true,
    type: "png",
    animations: "disabled"
  });

  const storageProvider = params.storageProvider ?? getLocalStorageProvider();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  return storageProvider.saveBuffer({
    buffer,
    path: `audits/${params.projectId}/${params.pageType}-${params.viewport}-${timestamp}.png`,
    contentType: "image/png"
  });
}
