import type { Page } from "playwright";
import { getEnv } from "@/src/lib/config/env";
import type { ExtractedPageData } from "./types";

type PageTelemetry = {
  consoleErrors: string[];
  failedRequests: ExtractedPageData["failedRequests"];
};

export async function extractPageData(page: Page, telemetry: PageTelemetry): Promise<ExtractedPageData> {
  const env = getEnv();

  const extracted = (await page.evaluate(`(() => {
    const maxTextLength = ${JSON.stringify(env.CRAWLER_MAX_TEXT_LENGTH)};
    const textFrom = (element) => (element && element.textContent ? element.textContent : "").replace(/\\s+/g, " ").trim();
    const attrFrom = (element, name) => {
      const value = element.getAttribute(name);
      return value && value.trim() ? value.trim() : undefined;
    };

    const visibleText = textFrom(document.body).slice(0, maxTextLength);
    const title = document.title.trim() || null;
    const metaDescriptionElement = document.querySelector('meta[name="description"]');
    const metaDescription = metaDescriptionElement && metaDescriptionElement.getAttribute("content")
      ? metaDescriptionElement.getAttribute("content").trim()
      : null;

    const headings = {
      h1: Array.from(document.querySelectorAll("h1")).map(textFrom).filter(Boolean),
      h2: Array.from(document.querySelectorAll("h2")).map(textFrom).filter(Boolean),
      h3: Array.from(document.querySelectorAll("h3")).map(textFrom).filter(Boolean)
    };

    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((element) => ({
        text: textFrom(element),
        href: element.href
      }))
      .filter((link) => link.href)
      .slice(0, 250);

    const buttons = Array.from(document.querySelectorAll("button, input[type='button'], input[type='submit']"))
      .map((element) => ({
        text: element instanceof HTMLInputElement ? element.value.trim() : textFrom(element),
        type: attrFrom(element, "type"),
        ariaLabel: attrFrom(element, "aria-label")
      }))
      .slice(0, 150);

    const forms = Array.from(document.querySelectorAll("form"))
      .map((form) => ({
        action: form.getAttribute("action") || undefined,
        method: form.getAttribute("method") || undefined,
        fields: Array.from(form.querySelectorAll("input, select, textarea")).map((field) => {
          const id = field.getAttribute("id");
          const label = id ? textFrom(document.querySelector('label[for="' + CSS.escape(id) + '"]')) : "";

          return {
            name: field.getAttribute("name") || undefined,
            type: field.getAttribute("type") || field.tagName.toLowerCase(),
            placeholder: field.getAttribute("placeholder") || undefined,
            label: label || undefined
          };
        })
      }))
      .slice(0, 50);

    const images = Array.from(document.querySelectorAll("img"))
      .map((image) => ({
        src: image.currentSrc || image.src || "",
        alt: image.getAttribute("alt") || undefined
      }))
      .filter((image) => image.src)
      .slice(0, 250);

    const scripts = Array.from(document.querySelectorAll("script[src]"))
      .map((script) => {
        const src = script.src || "";
        let isExternal = false;

        try {
          isExternal = Boolean(src) && new URL(src, window.location.href).hostname !== window.location.hostname;
        } catch {
          isExternal = false;
        }

        return {
          src,
          isExternal
        };
      })
      .filter((script) => script.src)
      .slice(0, 200);

    return {
      url: window.location.href,
      finalUrl: window.location.href,
      title,
      metaDescription,
      visibleText,
      headings,
      links,
      buttons,
      forms,
      images,
      scripts
    };
  })()`)) as Omit<ExtractedPageData, "consoleErrors" | "failedRequests">;

  return {
    ...extracted,
    consoleErrors: telemetry.consoleErrors,
    failedRequests: telemetry.failedRequests
  };
}
